import { Effect } from 'effect'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { RelayClient } from '../src/relayClient.ts'
import { buildTools } from '../src/tools.ts'
import {
  RELAY_DIRECTORY_VARIABLE,
  RELAY_PATH,
  catchAllUpgrades,
  connectionCount,
  listedIds,
  openRuntime,
  openSession,
  replay,
  startApplication,
} from './relayFixtures.ts'

const TEST_TIMEOUT = 30_000
const OBSERVATION_WINDOW = 1_000
const REQUESTS_PER_SESSION = 10

let workspaceDirectory = ''
let registryDirectory = ''
let previousRegistryDirectory: string | undefined
let errorLog = vi.spyOn(console, 'error')

beforeEach(async () => {
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
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

const applicationRoot = (application: string) =>
  join(workspaceDirectory, 'applications', application)

const findTool = (client: RelayClient, name: string) => {
  const tool = buildTools(client).find(candidate => candidate.name === name)
  if (tool === undefined) {
    throw new Error(`tool ${name} is missing`)
  }
  return tool
}

const toolOutput = async (
  client: RelayClient,
  name: string,
  input: unknown,
): Promise<unknown> => {
  const result = await Effect.runPromise(findTool(client, name).handle(input))
  return JSON.parse(result.content[0]?.text ?? '')
}

it(
  'keeps every session connected to its own application when several run at once',
  async () => {
    const seenPaths: Array<string> = []
    const names = ['first', 'second', 'third']
    const servers = await Promise.all(
      names.map(name =>
        startApplication(applicationRoot(name), [catchAllUpgrades(seenPaths)]),
      ),
    )
    await Promise.all(
      servers.map((server, index) =>
        openRuntime(server, `runtime-${names[index]}`),
      ),
    )
    const sessions = await Promise.all(
      names.flatMap(name => [
        openSession(applicationRoot(name)).then(client => ({ name, client })),
        openSession(applicationRoot(name)).then(client => ({ name, client })),
      ]),
    )

    await expect
      .poll(() => Promise.all(sessions.map(({ client }) => listedIds(client))))
      .toStrictEqual(sessions.map(({ name }) => [`runtime-${name}`]))

    await new Promise(done => setTimeout(done, OBSERVATION_WINDOW))

    expect(
      await Promise.all(sessions.map(({ client }) => listedIds(client))),
    ).toStrictEqual(sessions.map(({ name }) => [`runtime-${name}`]))
    const requestIndices = Array.from(
      { length: REQUESTS_PER_SESSION },
      (_, index) => index,
    )
    const replayed = await Promise.all(
      sessions.flatMap(({ client, name }, sessionIndex) =>
        requestIndices.map(requestIndex =>
          replay(
            client,
            `runtime-${name}`,
            sessionIndex * REQUESTS_PER_SESSION + requestIndex,
          ),
        ),
      ),
    )
    expect(replayed).toStrictEqual(
      sessions.flatMap(({ name }, sessionIndex) =>
        requestIndices.map(requestIndex => ({
          connectionId: `runtime-${name}`,
          keyframeIndex: sessionIndex * REQUESTS_PER_SESSION + requestIndex,
        })),
      ),
    )
    expect(seenPaths).not.toContain(RELAY_PATH)
    expect(connectionCount(errorLog.mock.calls)).toBe(sessions.length)
  },
  TEST_TIMEOUT,
)

it(
  'reaches every application under the workspace root as they start and stop',
  async () => {
    const first = await startApplication(applicationRoot('first'))
    const second = await startApplication(applicationRoot('second'))
    await openRuntime(first, 'runtime-first')
    await openRuntime(second, 'runtime-second')
    const session = await openSession(workspaceDirectory)

    await expect
      .poll(() => listedIds(session))
      .toStrictEqual(['runtime-first', 'runtime-second'])

    const third = await startApplication(applicationRoot('third'))
    await openRuntime(third, 'runtime-third')
    await expect
      .poll(() => listedIds(session))
      .toStrictEqual(['runtime-first', 'runtime-second', 'runtime-third'])

    await first.close()
    await expect
      .poll(() => listedIds(session))
      .toStrictEqual(['runtime-second', 'runtime-third'])

    const startedAt = Date.now()
    expect(await replay(session, 'runtime-first', 4)).toContain(
      'No connected Foldkit Runtime has the id runtime-first',
    )
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  },
  TEST_TIMEOUT,
)

it(
  'names the project root of each listed Runtime',
  async () => {
    const first = await startApplication(applicationRoot('first'))
    const second = await startApplication(applicationRoot('second'))
    await openRuntime(first, 'runtime-first')
    await openRuntime(second, 'runtime-second')
    const session = await openSession(workspaceDirectory)

    await expect
      .poll(() => toolOutput(session, 'foldkit_list_runtimes', {}))
      .toStrictEqual({
        _tag: 'ResponseRuntimes',
        runtimes: [
          {
            connectionId: 'runtime-first',
            url: 'http://app/',
            title: 'runtime-first',
            projectRoot: first.config.root,
          },
          {
            connectionId: 'runtime-second',
            url: 'http://app/',
            title: 'runtime-second',
            projectRoot: second.config.root,
          },
        ],
      })
  },
  TEST_TIMEOUT,
)

it(
  'defaults a tool call to the newest Runtime of the newest dev server',
  async () => {
    const older = await startApplication(applicationRoot('first'))
    const newer = await startApplication(applicationRoot('second'))
    await openRuntime(newer, 'runtime-newer-server-older')
    await openRuntime(newer, 'runtime-newer-server-newer')
    await openRuntime(older, 'runtime-older-server')
    const session = await openSession(workspaceDirectory)
    await expect
      .poll(() => listedIds(session))
      .toStrictEqual([
        'runtime-older-server',
        'runtime-newer-server-older',
        'runtime-newer-server-newer',
      ])

    expect(
      await toolOutput(session, 'foldkit_replay_to_keyframe', {
        keyframe_index: 7,
      }),
    ).toStrictEqual({
      _tag: 'ResponseReplayed',
      model: { connectionId: 'runtime-newer-server-newer', keyframeIndex: 7 },
    })
  },
  TEST_TIMEOUT,
)

it(
  'keeps a dev server reachable after a second one for the same root stops',
  async () => {
    const first = await startApplication(applicationRoot('first'))
    await openRuntime(first, 'runtime-first')
    const duplicate = await startApplication(applicationRoot('first'))
    await openRuntime(duplicate, 'runtime-duplicate')
    const session = await openSession(applicationRoot('first'))

    await expect
      .poll(() => listedIds(session))
      .toStrictEqual(['runtime-first', 'runtime-duplicate'])

    await duplicate.close()

    await expect.poll(() => listedIds(session)).toStrictEqual(['runtime-first'])
    expect(await replay(session, 'runtime-first', 1)).toStrictEqual({
      connectionId: 'runtime-first',
      keyframeIndex: 1,
    })
  },
  TEST_TIMEOUT,
)
