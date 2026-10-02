import { Array, Effect, Exit, Option } from 'effect'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { makeRelayClient } from '../src/relayClient.ts'
import {
  RELAY_DIRECTORY_VARIABLE,
  connectionCount,
  listedIds,
  openRuntime,
  openSession,
  startApplication,
} from './relayFixtures.ts'

const TEST_TIMEOUT = 30_000
const IDLE_WINDOW = 500
const CALL_COUNT = 3
const CLOSE_DELAY = 100
const CONNECT_TIMEOUT = 2_000

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

const fixedTarget = (url: string) => [
  { key: url, url, maybeProjectRoot: Option.none<string>() },
]

const startDroppingRelay = async () => {
  const relay = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  onTestFinished(() => new Promise<void>(done => relay.close(() => done())))
  await new Promise<void>(resolveListening =>
    relay.once('listening', () => resolveListening()),
  )
  const address = relay.address()
  if (address === null || typeof address === 'string') {
    throw new Error('relay has no port')
  }
  const connections = { count: 0 }
  relay.on('connection', socket => {
    connections.count += 1
    socket.close()
  })
  return { url: `ws://127.0.0.1:${address.port}`, connections }
}

const startStalledServer = async () => {
  const stalled = createNetServer(socket => {
    socket.resume()
  })
  onTestFinished(() => new Promise<void>(done => stalled.close(() => done())))
  await new Promise<void>(resolveListening =>
    stalled.listen(0, '127.0.0.1', () => resolveListening()),
  )
  const address = stalled.address()
  if (address === null || typeof address === 'string') {
    throw new Error('server has no port')
  }
  return `ws://127.0.0.1:${address.port}`
}

it(
  'connects on the first call after the dev server starts',
  async () => {
    const application = join(workspaceDirectory, 'application')
    const session = await openSession(application)

    await expect(listedIds(session)).rejects.toThrow(
      'Not connected to a Foldkit dev server',
    )

    const server = await startApplication(application)
    await openRuntime(server, 'runtime-application')

    await expect
      .poll(() => listedIds(session))
      .toStrictEqual(['runtime-application'])
    expect(await listedIds(session)).toStrictEqual(['runtime-application'])
    expect(connectionCount(errorLog.mock.calls)).toBe(1)
  },
  TEST_TIMEOUT,
)

it(
  'follows a dev server restart on the next call',
  async () => {
    const application = join(workspaceDirectory, 'application')
    const server = await startApplication(application)
    const session = await openSession(application)
    expect(await listedIds(session)).toStrictEqual([])

    await server.restart()

    await expect.poll(() => listedIds(session)).toStrictEqual([])
    expect(connectionCount(errorLog.mock.calls)).toBe(2)
  },
  TEST_TIMEOUT,
)

it(
  'opens at most one connection per call to a relay that drops each one',
  async () => {
    const relay = await startDroppingRelay()
    const client = await Effect.runPromise(
      makeRelayClient(Effect.succeed(fixedTarget(relay.url))),
    )
    onTestFinished(() => Effect.runPromise(client.close))

    await new Promise(done => setTimeout(done, IDLE_WINDOW))
    expect(relay.connections.count).toBe(0)

    await Effect.runPromise(
      Effect.forEach(
        Array.range(1, CALL_COUNT),
        () => Effect.exit(client.listRuntimes),
        { discard: true },
      ),
    )
    await new Promise(done => setTimeout(done, IDLE_WINDOW))

    expect(relay.connections.count).toBeGreaterThan(0)
    expect(relay.connections.count).toBeLessThanOrEqual(CALL_COUNT)
  },
  TEST_TIMEOUT,
)

it(
  'closes without an uncaught error while a connection is still opening',
  async () => {
    const url = await startStalledServer()
    const uncaught: Array<unknown> = []
    const onUncaught = (error: unknown) => uncaught.push(error)
    process.on('uncaughtException', onUncaught)
    onTestFinished(() => {
      process.off('uncaughtException', onUncaught)
    })
    const client = await Effect.runPromise(
      makeRelayClient(Effect.succeed(fixedTarget(url))),
    )

    const startedAt = Date.now()
    const pending = Effect.runPromise(Effect.exit(client.listRuntimes))
    await new Promise(done => setTimeout(done, CLOSE_DELAY))
    await Effect.runPromise(client.close)
    const exit = await pending
    await new Promise(done => setTimeout(done, CLOSE_DELAY))

    expect(Exit.isFailure(exit)).toBe(true)
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(CONNECT_TIMEOUT)
    expect(uncaught).toStrictEqual([])
  },
  TEST_TIMEOUT,
)
