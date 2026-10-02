import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
  RELAY_DIRECTORY_VARIABLE,
  listedIds,
  openRuntime,
  openSession,
  startApplication,
} from './relayFixtures.ts'

const TEST_TIMEOUT = 30_000
// NOTE: A junction needs no elevation on Windows, where a directory symlink
// does.
const DIRECTORY_LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir'

let workspaceDirectory = ''
let registryDirectory = ''
let previousRegistryDirectory: string | undefined

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  previousRegistryDirectory = process.env[RELAY_DIRECTORY_VARIABLE]
  workspaceDirectory = await realpath(
    await mkdtemp(join(tmpdir(), 'foldkit-workspace-')),
  )
  registryDirectory = await mkdtemp(join(tmpdir(), 'foldkit-mcp-relay-'))
  process.env[RELAY_DIRECTORY_VARIABLE] = registryDirectory
})

afterEach(async () => {
  vi.restoreAllMocks()
  if (previousRegistryDirectory === undefined) {
    delete process.env[RELAY_DIRECTORY_VARIABLE]
  } else {
    process.env[RELAY_DIRECTORY_VARIABLE] = previousRegistryDirectory
  }
  await rm(registryDirectory, { recursive: true, force: true })
  await rm(workspaceDirectory, { recursive: true, force: true })
})

it(
  'finds the enclosing application from a directory inside it and through a symlink',
  async () => {
    const application = join(workspaceDirectory, 'application')
    const server = await startApplication(application)
    await openRuntime(server, 'runtime-application')
    const link = join(workspaceDirectory, 'link-to-application')
    await symlink(application, link, DIRECTORY_LINK_TYPE)

    const nested = await openSession(join(application, 'src'))
    const linked = await openSession(link)

    await expect
      .poll(() => listedIds(nested))
      .toStrictEqual(['runtime-application'])
    expect(await listedIds(linked)).toStrictEqual(['runtime-application'])
  },
  TEST_TIMEOUT,
)

it(
  'reaches only the nearest enclosing application',
  async () => {
    const application = join(workspaceDirectory, 'application')
    const workspaceServer = await startApplication(workspaceDirectory)
    const applicationServer = await startApplication(application)
    await openRuntime(workspaceServer, 'runtime-workspace')
    await openRuntime(applicationServer, 'runtime-application')
    const workspace = await openSession(workspaceDirectory)
    const nested = await openSession(join(application, 'src'))

    await expect
      .poll(() => listedIds(workspace))
      .toStrictEqual(['runtime-workspace', 'runtime-application'])
    expect(await listedIds(nested)).toStrictEqual(['runtime-application'])
  },
  TEST_TIMEOUT,
)
