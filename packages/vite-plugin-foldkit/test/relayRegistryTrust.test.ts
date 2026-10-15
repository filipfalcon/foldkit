import { Effect, Layer, Option, pipe } from 'effect'
import { ChildProcessSpawner } from 'effect/process'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmod,
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'

import { NodeFileSystem, NodeServices } from '@effect/platform-node'

import {
  powershellPath,
  probeWindowsDirectory,
  relayRegistryTrust,
  windowsDirectoryRefusal,
} from '../src/relayRegistryTrust.ts'

const USER = 'S-1-5-21-1111111111-2222222222-3333333333-1001'
const OTHER = 'S-1-5-21-1111111111-2222222222-3333333333-1002'
const GROUP = 'S-1-5-21-1111111111-2222222222-3333333333-513'
const PRIVATE = `O:${USER}G:${GROUP}D:(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;${USER})`
const SHARED = `O:${USER}G:${GROUP}D:(A;OICI;FA;;;${USER})(A;OICI;0x1200a9;;;BU)`
const IDENTITY = `"host\\user","${USER}"`
const USERS_GROUP_SID = 'S-1-5-32-545'
const PROBED_DIRECTORY = 'C:\\registry'
const PROBE_TEST_TIMEOUT = 30_000
const NATIVE_PROBE_TIMEOUT = 10_000
const NATIVE_PROBE_SCRIPT =
  '(Get-Acl -LiteralPath $env:FOLDKIT_DEVTOOLS_PROBED_DIRECTORY).Sddl; & "$env:SystemRoot\\System32\\whoami.exe" /user /fo csv /nh'
const SECONDS_PAST_PROBE_LIMIT = '30'
const STAND_IN_POWERSHELL = join(
  import.meta.dirname,
  'fixtures',
  'standInPowerShell.sh',
)

const UNVERIFIED_OWNERSHIP = Option.some(
  'has ownership that cannot be verified',
)
const UNVERIFIED_PERMISSIONS = Option.some(
  'has permissions that cannot be verified',
)
const OWNED_BY_ANOTHER_USER = Option.some('is owned by another user')
const SHARED_WITH_OTHER_USERS = Option.some(
  'is readable or writable by other users',
)

describe('windowsDirectoryRefusal', () => {
  it('accepts inherited entries and a directory owned by Administrators', () => {
    expect(windowsDirectoryRefusal(PRIVATE, USER)).toStrictEqual(Option.none())
    expect(
      windowsDirectoryRefusal(
        `O:BAG:${GROUP}D:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICIIO;GA;;;CO)(A;OICI;FA;;;${USER})S:AI(AU;SA;FA;;;WD)`,
        USER,
      ),
    ).toStrictEqual(Option.none())
  })

  it('refuses another owner', () => {
    expect(
      windowsDirectoryRefusal(
        `O:${OTHER}G:${GROUP}D:(A;OICI;FA;;;${USER})`,
        USER,
      ),
    ).toStrictEqual(OWNED_BY_ANOTHER_USER)
  })

  it('refuses an entry that allows another account', () => {
    for (const account of ['BU', 'WD', 'AU', OTHER]) {
      expect(
        windowsDirectoryRefusal(
          `O:${USER}G:${GROUP}D:(A;OICI;FA;;;${USER})(A;OICI;0x1200a9;;;${account})`,
          USER,
        ),
      ).toStrictEqual(SHARED_WITH_OTHER_USERS)
    }
  })

  it('ignores deny entries', () => {
    expect(
      windowsDirectoryRefusal(
        `O:${USER}G:${GROUP}D:(D;OICI;FA;;;BU)(OD;;FA;guid;;WD)(A;OICI;FA;;;${USER})`,
        USER,
      ),
    ).toStrictEqual(Option.none())
  })

  it('refuses a null access control list', () => {
    expect(
      windowsDirectoryRefusal(`O:${USER}G:${GROUP}D:NO_ACCESS_CONTROL`, USER),
    ).toStrictEqual(SHARED_WITH_OTHER_USERS)
  })

  it('refuses a descriptor it cannot read', () => {
    expect(
      windowsDirectoryRefusal(
        `O:${USER}G:${GROUP}D:(XA;;FA;;;BU;(@User.Title=="PM"))`,
        USER,
      ),
    ).toStrictEqual(UNVERIFIED_OWNERSHIP)
    expect(windowsDirectoryRefusal('Access is denied.', USER)).toStrictEqual(
      UNVERIFIED_OWNERSHIP,
    )
    expect(windowsDirectoryRefusal(`O:${USER}G:${GROUP}`, USER)).toStrictEqual(
      UNVERIFIED_PERMISSIONS,
    )
    expect(
      windowsDirectoryRefusal(`O:${USER}D:(A;OICI;FA;;${USER})`, USER),
    ).toStrictEqual(UNVERIFIED_PERMISSIONS)
    expect(
      windowsDirectoryRefusal(`O:${USER}D:(AU;SA;FA;;;${USER})`, USER),
    ).toStrictEqual(UNVERIFIED_PERMISSIONS)
  })
})

describe('powershellPath', () => {
  it('names PowerShell by its absolute path under the system root', () => {
    expect(powershellPath('C:\\Windows')).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )
  })
})

const probeOutput = (...lines: ReadonlyArray<string>): string =>
  lines.map(line => `${line}\n`).join('')

type StandInPowerShell = Readonly<{
  executable: string
  runCount: () => Promise<number>
  receivedDirectory: () => Promise<string>
}>

const standInPowerShell = async (
  inputs: Readonly<Record<string, string>>,
): Promise<StandInPowerShell> => {
  const directory = await mkdtemp(join(tmpdir(), 'foldkit-probe-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const executable = join(directory, 'powershell')
  await copyFile(STAND_IN_POWERSHELL, executable)
  await chmod(executable, 0o755)

  for (const [name, contents] of Object.entries(inputs)) {
    await writeFile(join(directory, name), contents)
  }

  return {
    executable,
    runCount: async () =>
      (await readFile(join(directory, 'runs'), 'utf-8'))
        .split('\n')
        .filter(line => line !== '').length,
    receivedDirectory: () => readFile(join(directory, 'received'), 'utf-8'),
  }
}

const probe = (executable: string, directory: string) =>
  Effect.runPromise(
    probeWindowsDirectory(Option.some(executable), directory).pipe(
      Effect.provide(NodeServices.layer),
    ),
  )

describe('probeWindowsDirectory', () => {
  it.skipIf(process.platform === 'win32')(
    'reads the descriptor and the user from the probe output',
    async () => {
      const accepted = await standInPowerShell({
        reply: `${PRIVATE}\r\n${IDENTITY}\r\n`,
      })
      const shared = await standInPowerShell({
        reply: probeOutput('', SHARED, IDENTITY),
      })

      expect(await probe(accepted.executable, PROBED_DIRECTORY)).toStrictEqual(
        Option.none(),
      )
      expect(await probe(shared.executable, PROBED_DIRECTORY)).toStrictEqual(
        SHARED_WITH_OTHER_USERS,
      )
    },
  )

  it.skipIf(process.platform === 'win32')(
    'passes the directory through the environment',
    async () => {
      const directory = `C:\\it's "here" $(exit 1)`
      const echoing = await standInPowerShell({})

      expect(await probe(echoing.executable, directory)).toStrictEqual(
        UNVERIFIED_OWNERSHIP,
      )
      expect(await echoing.receivedDirectory()).toBe(directory)
    },
  )

  it.skipIf(process.platform === 'win32')(
    'refuses when the probe fails, prints too little, or does not finish',
    async () => {
      const failing = await standInPowerShell({
        reply: probeOutput(PRIVATE, IDENTITY),
        status: '1',
      })
      const silent = await standInPowerShell({ reply: probeOutput(PRIVATE) })
      const anonymous = await standInPowerShell({
        reply: probeOutput(PRIVATE, '"host\\user","unknown"'),
      })
      const hanging = await standInPowerShell({
        reply: probeOutput(PRIVATE, IDENTITY),
        delay: SECONDS_PAST_PROBE_LIMIT,
      })

      expect(await probe(failing.executable, PROBED_DIRECTORY)).toStrictEqual(
        UNVERIFIED_OWNERSHIP,
      )
      expect(await probe(silent.executable, PROBED_DIRECTORY)).toStrictEqual(
        UNVERIFIED_OWNERSHIP,
      )
      expect(await probe(anonymous.executable, PROBED_DIRECTORY)).toStrictEqual(
        UNVERIFIED_OWNERSHIP,
      )
      expect(await probe(hanging.executable, PROBED_DIRECTORY)).toStrictEqual(
        UNVERIFIED_OWNERSHIP,
      )
    },
    PROBE_TEST_TIMEOUT,
  )

  it('refuses when the probe cannot start', async () => {
    const missing = join(tmpdir(), 'foldkit-missing-probe', 'powershell.exe')

    expect(await probe(missing, PROBED_DIRECTORY)).toStrictEqual(
      UNVERIFIED_OWNERSHIP,
    )
  })

  it.skipIf(process.platform === 'win32')(
    'reads the descriptor again on every lookup',
    async () => {
      const changingAccess = await standInPowerShell({
        'reply-1': probeOutput(PRIVATE, IDENTITY),
        'reply-2': probeOutput(SHARED, IDENTITY),
        'reply-3': probeOutput(PRIVATE, IDENTITY),
      })

      expect(
        await probe(changingAccess.executable, PROBED_DIRECTORY),
      ).toStrictEqual(Option.none())
      expect(
        await probe(changingAccess.executable, PROBED_DIRECTORY),
      ).toStrictEqual(SHARED_WITH_OTHER_USERS)
      expect(
        await probe(changingAccess.executable, PROBED_DIRECTORY),
      ).toStrictEqual(Option.none())
      expect(await changingAccess.runCount()).toBe(3)
    },
    PROBE_TEST_TIMEOUT,
  )

  it('refuses without probing when no PowerShell path is known', async () => {
    expect(
      await Effect.runPromise(
        probeWindowsDirectory(Option.none(), PROBED_DIRECTORY).pipe(
          Effect.provide(NodeServices.layer),
        ),
      ),
    ).toStrictEqual(UNVERIFIED_OWNERSHIP)
  })
})

const icaclsPath = (): string =>
  pipe(
    Option.fromNullishOr(process.env['SystemRoot']),
    Option.map(systemRoot => win32.join(systemRoot, 'System32', 'icacls.exe')),
    Option.getOrThrowWith(() => new Error('SystemRoot is not set')),
  )

const describeNativeProbe = (directory: string, spawnedCount: number) => {
  const systemRoots = Object.entries(process.env).filter(
    ([name]) => name.toLowerCase() === 'systemroot',
  )
  const systemRoot = process.env['SystemRoot']

  if (systemRoot === undefined) {
    return { systemRoots, spawnedCount }
  }

  const probe = spawnSync(
    powershellPath(systemRoot),
    ['-NoProfile', '-NonInteractive', '-Command', NATIVE_PROBE_SCRIPT],
    {
      env: {
        ...process.env,
        FOLDKIT_DEVTOOLS_PROBED_DIRECTORY: directory,
      },
      timeout: NATIVE_PROBE_TIMEOUT,
    },
  )

  return {
    systemRoots,
    spawnedCount,
    status: probe.status,
    error: probe.error?.message,
    stdout: probe.stdout?.toString('utf8'),
    stdoutHex: probe.stdout?.toString('hex'),
    stderr: probe.stderr?.toString('utf8'),
    stderrHex: probe.stderr?.toString('hex'),
  }
}

describe('relayRegistryTrust', () => {
  it.runIf(process.platform === 'win32')(
    'reads the access list again on every lookup',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'foldkit-trusted-'))
      onTestFinished(() => rm(directory, { recursive: true, force: true }))
      const spawned = { count: 0 }
      const countingSpawner = Layer.effect(
        ChildProcessSpawner.ChildProcessSpawner,
        Effect.map(ChildProcessSpawner.ChildProcessSpawner, spawner =>
          ChildProcessSpawner.make(command => {
            spawned.count += 1

            return spawner.spawn(command)
          }),
        ),
      ).pipe(Layer.provide(NodeServices.layer))
      const services = Layer.merge(NodeFileSystem.layer, countingSpawner)
      const lookUp = () =>
        Effect.runPromise(
          relayRegistryTrust.refusal(directory).pipe(Effect.provide(services)),
        )

      const firstRefusal = await lookUp()

      expect(
        firstRefusal,
        Option.isSome(firstRefusal)
          ? JSON.stringify(describeNativeProbe(directory, spawned.count))
          : undefined,
      ).toStrictEqual(Option.none())
      expect(spawned.count).toBe(1)

      execFileSync(icaclsPath(), [
        directory,
        '/grant',
        `*${USERS_GROUP_SID}:(OI)(CI)RX`,
      ])
      expect(await lookUp()).toStrictEqual(SHARED_WITH_OTHER_USERS)
      expect(spawned.count).toBe(2)

      execFileSync(icaclsPath(), [
        directory,
        '/remove:g',
        `*${USERS_GROUP_SID}`,
      ])
      expect(await lookUp()).toStrictEqual(Option.none())
      expect(spawned.count).toBe(3)
    },
    PROBE_TEST_TIMEOUT,
  )
})
