import { Effect } from 'effect'
import type { RelayRecord } from 'foldkit/devtools-protocol'
import { execFileSync } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { createServer } from 'vite'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'

import { foldkit } from '@foldkit/vite-plugin'

import { discoverRelays } from '../src/relayRegistry.ts'
import { makeRelayRegistryTrust } from '../src/relayRegistryTrust.ts'
import {
  RELAY_DIRECTORY_VARIABLE,
  listedIds,
  openRuntime,
  openSession,
  runWithNode,
  startApplication,
} from './relayFixtures.ts'

const RUNTIME_DIRECTORY_VARIABLE = 'XDG_RUNTIME_DIR'
const USERS_GROUP_SID = 'S-1-5-32-545'
const SHARED_WITH_OTHER_USERS = 'is readable or writable by other users'
const TEST_TIMEOUT = 30_000

const icaclsPath = (): string => {
  const systemRoot = process.env['SystemRoot']
  if (systemRoot === undefined) {
    throw new Error('SystemRoot is not set')
  }
  return win32.join(systemRoot, 'System32', 'icacls.exe')
}

let workspaceDirectory = ''
let previousRegistryDirectory: string | undefined
let previousRuntimeDirectory: string | undefined

beforeEach(async () => {
  previousRegistryDirectory = process.env[RELAY_DIRECTORY_VARIABLE]
  previousRuntimeDirectory = process.env[RUNTIME_DIRECTORY_VARIABLE]
  workspaceDirectory = await realpath(
    await mkdtemp(join(tmpdir(), 'foldkit-workspace-')),
  )
})

afterEach(async () => {
  vi.restoreAllMocks()
  if (previousRegistryDirectory === undefined) {
    delete process.env[RELAY_DIRECTORY_VARIABLE]
  } else {
    process.env[RELAY_DIRECTORY_VARIABLE] = previousRegistryDirectory
  }
  if (previousRuntimeDirectory === undefined) {
    delete process.env[RUNTIME_DIRECTORY_VARIABLE]
  } else {
    process.env[RUNTIME_DIRECTORY_VARIABLE] = previousRuntimeDirectory
  }
  await rm(workspaceDirectory, { recursive: true, force: true })
})

it.runIf(process.platform === 'win32')(
  'publishes under the temporary directory and discovers through it',
  async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    delete process.env[RELAY_DIRECTORY_VARIABLE]
    delete process.env[RUNTIME_DIRECTORY_VARIABLE]
    const application = join(workspaceDirectory, 'application')
    const server = await startApplication(application)
    await openRuntime(server, 'runtime-application')
    const session = await openSession(application)

    await expect
      .poll(() => listedIds(session))
      .toStrictEqual(['runtime-application'])
  },
  TEST_TIMEOUT,
)

it.runIf(process.platform === 'win32')(
  'neither publishes to nor reads from a directory other users can read',
  async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const registryDirectory = join(workspaceDirectory, 'registry')
    const application = join(workspaceDirectory, 'application')
    await mkdir(registryDirectory)
    await mkdir(application)
    execFileSync(icaclsPath(), [
      registryDirectory,
      '/grant',
      `*${USERS_GROUP_SID}:(OI)(CI)RX`,
    ])
    process.env[RELAY_DIRECTORY_VARIABLE] = registryDirectory
    const planted: RelayRecord = {
      version: 1,
      id: 'planted',
      root: application,
      url: 'ws://127.0.0.1:1/__foldkit/devtools-mcp?token=planted',
      pid: process.pid,
      startedAt: 1,
    }
    await writeFile(
      join(registryDirectory, 'planted.json'),
      JSON.stringify(planted),
    )

    const server = await createServer({
      root: application,
      configFile: false,
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1' },
      plugins: [foldkit()],
    })
    onTestFinished(() => server.close().catch(() => undefined))
    await server.listen()

    await expect
      .poll(() => reported.mock.calls.map(call => call.join(' ')))
      .toContainEqual(expect.stringContaining(SHARED_WITH_OTHER_USERS))
    expect(await readdir(registryDirectory)).toStrictEqual(['planted.json'])
    expect(
      await runWithNode(
        Effect.flatMap(makeRelayRegistryTrust, trust =>
          discoverRelays(application, trust),
        ),
      ),
    ).toStrictEqual([])
  },
  TEST_TIMEOUT,
)
