import {
  Array,
  Duration,
  Effect,
  FileSystem,
  HashMap,
  Option,
  type PlatformError,
  Ref,
  Stream,
  String,
  pipe,
} from 'effect'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import { win32 } from 'node:path'

const PERMISSIONS_BEYOND_OWNER = 0o077
const PROBE_TIMEOUT = Duration.seconds(10)
const PROBED_DIRECTORY_VARIABLE = 'FOLDKIT_DEVTOOLS_PROBED_DIRECTORY'
const PROBE_SCRIPT = `(Get-Acl -LiteralPath $env:${PROBED_DIRECTORY_VARIABLE}).Sddl; & "$env:SystemRoot\\System32\\whoami.exe" /user /fo csv /nh`

const UNVERIFIED_OWNERSHIP = 'has ownership that cannot be verified'
const UNVERIFIED_PERMISSIONS = 'has permissions that cannot be verified'
const OWNED_BY_ANOTHER_USER = 'is owned by another user'
const SHARED_WITH_OTHER_USERS = 'is readable or writable by other users'

const SECURITY_DESCRIPTOR_PATTERN =
  /^O:(S-1-[0-9-]+|[A-Z]{2})(?:G:(?:S-1-[0-9-]+|[A-Z]{2}))?(?:D:([A-Z_]*)((?:\([^()]*\))*))?(?:S:.*)?$/
const ACCESS_CONTROL_ENTRY_PATTERN = /\(([^()]*)\)/g
const ACCESS_CONTROL_ENTRY_FIELD_COUNT = 6
const NO_ACCESS_CONTROL_FLAG = 'NO_ACCESS_CONTROL'
const ALLOW_ENTRY_TYPES: ReadonlyArray<string> = ['A', 'OA']
const DENY_ENTRY_TYPES: ReadonlyArray<string> = ['D', 'OD']
const PRIVILEGED_ACCOUNTS: ReadonlyArray<string> = [
  'SY',
  'S-1-5-18',
  'BA',
  'S-1-5-32-544',
]
const CREATOR_ACCOUNTS: ReadonlyArray<string> = [
  'CO',
  'S-1-3-0',
  'OW',
  'S-1-3-4',
]
const QUOTED_CSV_FIELD_PATTERN = /"([^"]*)"/g
const SECURITY_IDENTIFIER_PATTERN = /^S-1-[0-9-]+$/

type AccessControlEntry = Readonly<{
  type: string
  account: string
}>

export type RelayRegistryTrust = Readonly<{
  refusal: (
    directory: string,
  ) => Effect.Effect<
    Option.Option<string>,
    PlatformError.PlatformError,
    FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  >
}>

export const relayRegistryDirectoryRefusal = (
  info: FileSystem.File.Info,
  maybeCurrentUid: Option.Option<number>,
): Option.Option<string> =>
  Option.match(maybeCurrentUid, {
    onNone: () => Option.some(UNVERIFIED_OWNERSHIP),
    onSome: currentUid => {
      if (Option.isNone(info.uid)) {
        return Option.some(UNVERIFIED_OWNERSHIP)
      }

      if (info.uid.value !== currentUid) {
        return Option.some(OWNED_BY_ANOTHER_USER)
      }

      if ((info.mode & PERMISSIONS_BEYOND_OWNER) !== 0) {
        return Option.some(SHARED_WITH_OTHER_USERS)
      }

      return Option.none()
    },
  })

const parseAccessControlEntry = (
  entry: string,
): Option.Option<AccessControlEntry> => {
  const fields = String.split(entry, ';')
  if (fields.length !== ACCESS_CONTROL_ENTRY_FIELD_COUNT) {
    return Option.none()
  }

  const type = Array.headNonEmpty(fields)
  const isKnownType =
    Array.contains(ALLOW_ENTRY_TYPES, type) ||
    Array.contains(DENY_ENTRY_TYPES, type)
  if (!isKnownType) {
    return Option.none()
  }

  return Option.some({ type, account: Array.lastNonEmpty(fields) })
}

const parseAccessControlEntries = (
  entries: string,
): Option.Option<ReadonlyArray<AccessControlEntry>> =>
  pipe(
    Array.fromIterable(entries.matchAll(ACCESS_CONTROL_ENTRY_PATTERN)),
    Array.map(([, entry]) =>
      Option.flatMap(Option.fromNullishOr(entry), parseAccessControlEntry),
    ),
    Option.all,
  )

export const windowsDirectoryRefusal = (
  sddl: string,
  currentUserSid: string,
): Option.Option<string> => {
  const descriptor = SECURITY_DESCRIPTOR_PATTERN.exec(sddl)
  if (descriptor === null) {
    return Option.some(UNVERIFIED_OWNERSHIP)
  }

  const [, owner, flags, entries] = descriptor
  const maybeEntries = Option.flatMap(
    Option.fromNullishOr(entries),
    parseAccessControlEntries,
  )
  if (
    owner === undefined ||
    flags === undefined ||
    Option.isNone(maybeEntries)
  ) {
    return Option.some(UNVERIFIED_PERMISSIONS)
  }

  if (String.includes(NO_ACCESS_CONTROL_FLAG)(flags)) {
    return Option.some(SHARED_WITH_OTHER_USERS)
  }

  const trustedOwners = [currentUserSid, ...PRIVILEGED_ACCOUNTS]
  if (!Array.contains(trustedOwners, owner)) {
    return Option.some(OWNED_BY_ANOTHER_USER)
  }

  const trustedAccounts = [...trustedOwners, ...CREATOR_ACCOUNTS]
  const isSharedWithOtherUsers = Array.some(
    maybeEntries.value,
    ({ type, account }) =>
      Array.contains(ALLOW_ENTRY_TYPES, type) &&
      !Array.contains(trustedAccounts, account),
  )
  if (isSharedWithOtherUsers) {
    return Option.some(SHARED_WITH_OTHER_USERS)
  }

  return Option.none()
}

export const powershellPath = (systemRoot: string): string =>
  win32.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )

const currentUserSidFromCsv = (identity: string): Option.Option<string> =>
  pipe(
    Array.fromIterable(identity.matchAll(QUOTED_CSV_FIELD_PATTERN)),
    Array.map(([, field]) => Option.fromNullishOr(field)),
    Array.getSomes,
    Array.findLast(field => SECURITY_IDENTIFIER_PATTERN.test(field)),
  )

const probeOutputRefusal = (output: string): Option.Option<string> => {
  const lines = pipe(
    output,
    String.split(/\r?\n/),
    Array.map(String.trim),
    Array.filter(String.isNonEmpty),
  )
  const maybeDescriptor = Array.get(lines, 0)
  const maybeCurrentUserSid = Option.flatMap(
    Array.get(lines, 1),
    currentUserSidFromCsv,
  )

  return Option.match(Option.all([maybeDescriptor, maybeCurrentUserSid]), {
    onNone: () => Option.some(UNVERIFIED_OWNERSHIP),
    onSome: ([descriptor, currentUserSid]) =>
      windowsDirectoryRefusal(descriptor, currentUserSid),
  })
}

export const probeWindowsDirectory = (
  directory: string,
  executable: string,
): Effect.Effect<
  Option.Option<string>,
  never,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const probe = yield* spawner.spawn(
      ChildProcess.make(
        executable,
        ['-NoProfile', '-NonInteractive', '-Command', PROBE_SCRIPT],
        {
          env: { [PROBED_DIRECTORY_VARIABLE]: directory },
          extendEnv: true,
          stdin: 'ignore',
          stderr: 'ignore',
        },
      ),
    )
    const [output, exitCode] = yield* Effect.all(
      [pipe(probe.stdout, Stream.decodeText, Stream.mkString), probe.exitCode],
      { concurrency: 'unbounded' },
    )

    if (exitCode === 0) {
      return probeOutputRefusal(output)
    } else {
      return Option.some(UNVERIFIED_OWNERSHIP)
    }
  }).pipe(
    Effect.scoped,
    Effect.timeoutOrElse({
      duration: PROBE_TIMEOUT,
      orElse: () => Effect.succeed(Option.some(UNVERIFIED_OWNERSHIP)),
    }),
    Effect.orElseSucceed(() => Option.some(UNVERIFIED_OWNERSHIP)),
  )

export const makeRelayRegistryTrust: Effect.Effect<RelayRegistryTrust> =
  Effect.gen(function* () {
    const verdictsByDirectory = yield* Ref.make(
      HashMap.empty<string, Option.Option<string>>(),
    )

    const probeDirectory = (directory: string) =>
      Option.match(Option.fromNullishOr(process.env['SystemRoot']), {
        onNone: () => Effect.succeed(Option.some(UNVERIFIED_OWNERSHIP)),
        onSome: systemRoot =>
          probeWindowsDirectory(directory, powershellPath(systemRoot)),
      })

    const windowsRefusal = (directory: string, info: FileSystem.File.Info) =>
      Option.match(info.ino, {
        onNone: () => probeDirectory(directory),
        onSome: inode =>
          Effect.gen(function* () {
            const key = `${info.dev}:${inode}`
            const maybeVerdict = HashMap.get(
              yield* Ref.get(verdictsByDirectory),
              key,
            )
            if (Option.isSome(maybeVerdict)) {
              return maybeVerdict.value
            }

            const verdict = yield* probeDirectory(directory)
            yield* Ref.update(verdictsByDirectory, HashMap.set(key, verdict))
            return verdict
          }),
      })

    const refusal = (directory: string) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem
        const info = yield* fileSystem.stat(directory)

        if (process.platform === 'win32') {
          return yield* windowsRefusal(directory, info)
        } else {
          return relayRegistryDirectoryRefusal(
            info,
            Option.fromNullishOr(process.getuid?.()),
          )
        }
      })

    const trust: RelayRegistryTrust = { refusal }
    return trust
  })
