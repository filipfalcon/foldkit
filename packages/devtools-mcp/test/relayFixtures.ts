import { ConfigProvider, Effect, Option } from 'effect'
import { Request, type Response } from 'foldkit/devtools-protocol'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { type Plugin, type ViteDevServer, createServer } from 'vite'
import { expect, onTestFinished } from 'vitest'
import { WebSocket } from 'ws'

import * as NodeServices from '@effect/platform-node/NodeServices'
import { foldkit } from '@foldkit/vite-plugin'

import { type RelayClient, makeRelayClient } from '../src/relayClient.ts'
import { resolveRelayTargets } from '../src/relayLocation.ts'
import { makeRelayRegistryTrust } from '../src/relayRegistryTrust.ts'

export const RELAY_DIRECTORY_VARIABLE = 'FOLDKIT_DEVTOOLS_RELAY_DIRECTORY'
export const RELAY_PATH = '/__foldkit/devtools-mcp'
const DECLINE_DELAY = 50
const RUNTIME_RESPONSE_DELAY = 100

export const runWithNode = <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnv(),
      ),
      Effect.provide(NodeServices.layer),
    ),
  )

// NOTE: Models a full-stack dev plugin, such as a Workers runtime, that treats
// every non-Vite WebSocket upgrade as an application request and destroys the
// socket once the application declines it.
export const catchAllUpgrades = (seenPaths: Array<string>): Plugin => ({
  name: 'catch-all-upgrades',
  configureServer(server) {
    server.httpServer?.on('upgrade', (request, socket) => {
      const protocol = request.headers['sec-websocket-protocol'] ?? ''
      if (protocol.startsWith('vite')) {
        return
      }
      seenPaths.push(new URL(request.url ?? '/', 'http://dev').pathname)
      setTimeout(() => socket.destroy(), DECLINE_DELAY)
    })
  },
})

const serverPort = (server: ViteDevServer): number => {
  const address = server.httpServer?.address()
  if (
    address === null ||
    address === undefined ||
    typeof address === 'string'
  ) {
    throw new Error('The dev server has no bound port')
  }
  return address.port
}

const resolveTargetsFor = (projectRoot: string) =>
  Effect.flatMap(makeRelayRegistryTrust, trust =>
    resolveRelayTargets(
      {
        maybeConfiguredPort: Option.none(),
        maybeConfiguredHost: Option.none(),
        projectRoot,
      },
      trust,
    ),
  )

const publishedRelayCount = (root: string) =>
  runWithNode(resolveTargetsFor(root)).then(
    targets =>
      targets.filter(({ maybeProjectRoot }) =>
        Option.contains(maybeProjectRoot, root),
      ).length,
  )

export const startApplication = async (
  root: string,
  plugins: ReadonlyArray<Plugin> = [],
): Promise<ViteDevServer> => {
  await mkdir(join(root, 'src'), { recursive: true })
  const relaysBefore = await publishedRelayCount(root)
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1' },
    plugins: [...plugins, foldkit()],
  })
  onTestFinished(() => server.close().catch(() => undefined))
  await server.listen()
  await expect.poll(() => publishedRelayCount(root)).toBe(relaysBefore + 1)
  return server
}

// NOTE: Stands in for the browser bridge of one application: it announces a
// Runtime over Vite's HMR socket and answers each replay request addressed to
// that Runtime, slower than the catch-all plugin declines an upgrade.
export const openRuntime = async (
  server: ViteDevServer,
  connectionId: string,
): Promise<void> => {
  const browser = new WebSocket(
    `ws://127.0.0.1:${serverPort(server)}`,
    'vite-hmr',
  )
  onTestFinished(() => browser.terminate())
  await new Promise<void>((resolveOpen, reject) => {
    browser.once('open', () => resolveOpen())
    browser.once('error', reject)
  })
  const sendCustom = (event: string, data: unknown) =>
    browser.send(JSON.stringify({ type: 'custom', event, data }))
  browser.on('message', raw => {
    const payload = JSON.parse(raw.toString())
    if (
      payload.type !== 'custom' ||
      payload.event !== 'foldkit:devTools:request' ||
      payload.data.maybeConnectionId !== connectionId
    ) {
      return
    }
    setTimeout(
      () =>
        sendCustom('foldkit:devTools:response', {
          id: payload.data.id,
          response: {
            _tag: 'ResponseReplayed',
            model: {
              connectionId,
              keyframeIndex: payload.data.request.keyframeIndex,
            },
          },
        }),
      RUNTIME_RESPONSE_DELAY,
    )
  })
  sendCustom('foldkit:devTools:event', {
    maybeConnectionId: connectionId,
    event: {
      _tag: 'EventConnected',
      runtime: { connectionId, url: 'http://app/', title: connectionId },
    },
  })
}

export const openSession = async (
  projectRoot: string,
): Promise<RelayClient> => {
  const client = await runWithNode(
    Effect.flatMap(makeRelayRegistryTrust, trust =>
      makeRelayClient(
        resolveRelayTargets(
          {
            maybeConfiguredPort: Option.none(),
            maybeConfiguredHost: Option.none(),
            projectRoot,
          },
          trust,
        ),
      ),
    ),
  )
  onTestFinished(() => Effect.runPromise(client.close))
  return client
}

export const listedIds = (client: RelayClient) =>
  Effect.runPromise(client.listRuntimes).then(listed =>
    listed.map(({ runtime }) => runtime.connectionId),
  )

export const replay = (
  client: RelayClient,
  connectionId: string,
  keyframeIndex: number,
) =>
  Effect.runPromise(
    client
      .sendRequest(
        Request.RequestReplayToKeyframe({ keyframeIndex }),
        connectionId,
      )
      .pipe(
        Effect.map((response: typeof Response.Type) =>
          response._tag === 'ResponseReplayed' ? response.model : response._tag,
        ),
        Effect.catch(error => Effect.succeed(String(error))),
      ),
  )

export const connectionCount = (
  calls: ReadonlyArray<ReadonlyArray<unknown>>,
): number =>
  calls.filter(call => String(call[0]).includes('] connected to ')).length
