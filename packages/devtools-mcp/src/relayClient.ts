import {
  Array,
  type Cause,
  Console,
  Deferred,
  Duration,
  Effect,
  Exit,
  HashMap,
  HashSet,
  Match,
  Option,
  Ref,
  Schema,
  Semaphore,
  pipe,
} from 'effect'
import {
  Request,
  RequestFrame,
  type Response,
  ResponseFrame,
  type RuntimeInfo,
} from 'foldkit/devtools-protocol'
import { type RawData, WebSocket } from 'ws'

import type { RelayTarget } from './relayLocation.js'

const REQUEST_TIMEOUT = Duration.seconds(10)
const CONNECT_TIMEOUT = Duration.seconds(2)
const LIST_RUNTIMES_TIMEOUT = Duration.seconds(2)

const NOT_CONNECTED_REASON =
  'Not connected to a Foldkit dev server. Start your Foldkit Vite dev server and retry the tool call.'
const NO_RUNTIMES_REASON =
  'No connected Foldkit runtimes. Open a Foldkit dev page and try again.'

const encodeRequestFrameToJson = Schema.encodeUnknownSync(
  Schema.fromJsonString(RequestFrame),
)

type PendingResponses = HashMap.HashMap<
  string,
  Deferred.Deferred<typeof Response.Type, Error>
>

type RelaySocket = Readonly<{
  socket: WebSocket
  target: RelayTarget
}>

type RelayListing = Readonly<{
  relaySocket: RelaySocket
  runtimes: ReadonlyArray<typeof RuntimeInfo.Type>
}>

type RuntimeRoute = Readonly<{
  socket: WebSocket
  connectionId: string
}>

type RefreshTurn = Readonly<{
  refresh: Deferred.Deferred<ReadonlyArray<RelaySocket>>
  isLeader: boolean
}>

export type ListedRuntime = Readonly<{
  runtime: typeof RuntimeInfo.Type
  maybeProjectRoot: Option.Option<string>
}>

/**
 * A client to the DevTools relays of the Foldkit dev servers it finds.
 *
 * It connects only when called. Each call, including `sendRequest` with an
 * explicit Runtime id, looks up the relays in the registry, drops the sockets
 * of relays that are gone, opens one socket to each relay that has none, and
 * lists the Runtimes of every relay before it routes a request. It keeps no
 * Runtime membership between calls. Concurrent calls share one lookup that
 * starts after each of them arrives. A dev server that starts or restarts
 * between calls is reached on the next call, and a relay that drops every
 * connection costs one connection attempt per call.
 *
 * `listRuntimes` lists the Runtimes of every relay, oldest dev server first,
 * and fails when no relay accepts a connection. `sendRequest` sends to the
 * newest relay that lists the given Runtime, or without an id to the most
 * recently connected Runtime of the most recently started dev server. It fails
 * at once for an id that no relay lists, and with `TimeoutError` when no
 * response arrives in time.
 */
export type RelayClient = Readonly<{
  listRuntimes: Effect.Effect<ReadonlyArray<ListedRuntime>, Error>
  sendRequest: (
    request: typeof Request.Type,
    maybeRuntimeId: Option.Option<string>,
  ) => Effect.Effect<typeof Response.Type, Cause.TimeoutError | Error>
  close: Effect.Effect<void>
}>

const generateRequestId = (): string =>
  `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const relayUrlForLog = (url: string): string => {
  const parsed = new URL(url)
  parsed.search = ''
  return parsed.toString()
}

/**
 * Read a display string from a caught error. Effect's `TimeoutError` carries no
 * `message`, so `error.message` is `undefined` on a relay timeout; fall back to
 * the error's string form (its tag) rather than surfacing `Error: undefined`.
 */
export const errorReason = (error: Error): string =>
  error.message ? error.message : String(error)

const attemptOpen = (url: string): Effect.Effect<WebSocket, Error> =>
  Effect.callback<WebSocket, Error>(resume => {
    const socket = new WebSocket(url)
    let isSettled = false
    socket.once('open', () => {
      isSettled = true
      resume(Effect.succeed(socket))
    })
    socket.on('error', error => {
      if (!isSettled) {
        isSettled = true
        resume(Effect.fail(error))
      }
    })
    return Effect.sync(() => {
      isSettled = true
      socket.terminate()
    })
  })

const isOpen = ({ socket }: RelaySocket): boolean =>
  socket.readyState === WebSocket.OPEN

export const makeRelayClient = <Services>(
  resolveTargets: Effect.Effect<ReadonlyArray<RelayTarget>, never, Services>,
): Effect.Effect<RelayClient, never, Services> =>
  Effect.gen(function* () {
    const pendingResponsesRef = yield* Ref.make<PendingResponses>(
      HashMap.empty(),
    )
    const socketsRef = yield* Ref.make(HashMap.empty<string, RelaySocket>())
    const refreshLock = yield* Semaphore.make(1)
    const pendingRefreshRef = yield* Ref.make<
      Option.Option<Deferred.Deferred<ReadonlyArray<RelaySocket>>>
    >(Option.none())
    const isClosedRef = yield* Ref.make(false)
    const context = yield* Effect.context<Services>()

    const attachHandlers = (socket: WebSocket): void => {
      socket.on('message', raw => {
        Effect.runForkWith(context)(
          handleIncomingMessage(raw, pendingResponsesRef),
        )
      })
      socket.on('error', error => {
        console.error(`[foldkit-devtools-mcp] socket error: ${error.message}`)
      })
    }

    const openTarget = (
      target: RelayTarget,
    ): Effect.Effect<Option.Option<RelaySocket>> =>
      attemptOpen(target.url).pipe(
        Effect.timeoutOrElse({
          duration: CONNECT_TIMEOUT,
          orElse: () =>
            Effect.fail(
              new Error(
                `no connection within ${Duration.format(CONNECT_TIMEOUT)}`,
              ),
            ),
        }),
        Effect.tap(socket =>
          Effect.sync(() => attachHandlers(socket)).pipe(
            Effect.andThen(
              Console.error(
                `[foldkit-devtools-mcp] connected to ${relayUrlForLog(target.url)}`,
              ),
            ),
          ),
        ),
        Effect.map(socket => Option.some({ socket, target })),
        Effect.catch(error =>
          Console.error(
            `[foldkit-devtools-mcp] connect attempt to ${relayUrlForLog(target.url)} failed: ${errorReason(error)}`,
          ).pipe(Effect.as(Option.none<RelaySocket>())),
        ),
      )

    const reconcile: Effect.Effect<ReadonlyArray<RelaySocket>> = Effect.gen(
      function* () {
        if (yield* Ref.get(isClosedRef)) {
          return []
        }

        const targets = yield* Effect.provideContext(resolveTargets, context)
        const targetKeys = HashSet.fromIterable(
          Array.map(targets, ({ key }) => key),
        )
        const sockets = yield* Ref.get(socketsRef)

        const isKept = (relaySocket: RelaySocket, key: string): boolean =>
          HashSet.has(targetKeys, key) && isOpen(relaySocket)
        const keptSockets = HashMap.filter(sockets, isKept)
        const droppedSockets = HashMap.filter(
          sockets,
          (relaySocket, key) => !isKept(relaySocket, key),
        )
        yield* Effect.sync(() => {
          for (const { socket } of HashMap.values(droppedSockets)) {
            socket.terminate()
          }
        })

        const missingTargets = Array.filter(
          targets,
          ({ key }) => !HashMap.has(keptSockets, key),
        )
        const opened = Array.getSomes(
          yield* Effect.forEach(missingTargets, openTarget, {
            concurrency: 'unbounded',
          }),
        )
        const nextSockets = HashMap.union(
          keptSockets,
          HashMap.fromIterable(
            Array.map(opened, relaySocket => [
              relaySocket.target.key,
              relaySocket,
            ]),
          ),
        )
        yield* Ref.set(socketsRef, nextSockets)

        return pipe(
          targets,
          Array.reverse,
          Array.map(({ key }) => HashMap.get(nextSockets, key)),
          Array.getSomes,
        )
      },
    )

    const takeRefreshTurn = (
      ownRefresh: Deferred.Deferred<ReadonlyArray<RelaySocket>>,
    ): Effect.Effect<RefreshTurn> =>
      Ref.modify(pendingRefreshRef, maybePendingRefresh => {
        if (Option.isSome(maybePendingRefresh)) {
          const turn: RefreshTurn = {
            refresh: maybePendingRefresh.value,
            isLeader: false,
          }
          return [turn, maybePendingRefresh]
        } else {
          const turn: RefreshTurn = { refresh: ownRefresh, isLeader: true }
          return [turn, Option.some(ownRefresh)]
        }
      })

    const refreshRelays: Effect.Effect<ReadonlyArray<RelaySocket>> =
      Effect.uninterruptibleMask(restore =>
        Effect.gen(function* () {
          const ownRefresh = yield* Deferred.make<ReadonlyArray<RelaySocket>>()
          const { refresh, isLeader } = yield* takeRefreshTurn(ownRefresh)

          if (isLeader) {
            yield* refreshLock.withPermits(1)(
              Effect.gen(function* () {
                yield* Ref.set(pendingRefreshRef, Option.none())
                const relaySockets = yield* reconcile
                yield* Deferred.succeed(refresh, relaySockets)
              }),
            )
          }

          return yield* restore(Deferred.await(refresh))
        }),
      )

    const exchange = (
      socket: WebSocket,
      request: typeof Request.Type,
      maybeConnectionId: Option.Option<string>,
      timeout: Duration.Duration,
    ): Effect.Effect<typeof Response.Type, Cause.TimeoutError | Error> =>
      Effect.gen(function* () {
        const id = generateRequestId()
        const deferred = yield* Deferred.make<typeof Response.Type, Error>()
        yield* Ref.update(pendingResponsesRef, HashMap.set(id, deferred))

        const frame: typeof RequestFrame.Type = {
          id,
          maybeConnectionId,
          request,
        }

        yield* Effect.try({
          try: () => socket.send(encodeRequestFrameToJson(frame)),
          catch: error =>
            error instanceof Error
              ? error
              : new Error(`Failed to send request: ${String(error)}`),
        }).pipe(
          Effect.tapError(() =>
            Ref.update(pendingResponsesRef, HashMap.remove(id)),
          ),
        )

        return yield* Deferred.await(deferred).pipe(
          Effect.timeout(timeout),
          Effect.onError(() =>
            Ref.update(pendingResponsesRef, HashMap.remove(id)),
          ),
        )
      })

    const listRelayRuntimes = ({
      socket,
      target,
    }: RelaySocket): Effect.Effect<ReadonlyArray<typeof RuntimeInfo.Type>> =>
      exchange(
        socket,
        Request.RequestListRuntimes(),
        Option.none(),
        LIST_RUNTIMES_TIMEOUT,
      ).pipe(
        Effect.flatMap(response =>
          Match.value(response).pipe(
            Match.withReturnType<
              Effect.Effect<ReadonlyArray<typeof RuntimeInfo.Type>, Error>
            >(),
            Match.tag('ResponseRuntimes', ({ runtimes }) =>
              Effect.succeed(runtimes),
            ),
            Match.tag('ResponseError', ({ reason }) =>
              Effect.fail(new Error(reason)),
            ),
            Match.orElse(({ _tag }) =>
              Effect.fail(new Error(`the relay answered ${_tag}`)),
            ),
          ),
        ),
        Effect.catch(error =>
          Console.error(
            `[foldkit-devtools-mcp] listing runtimes at ${relayUrlForLog(target.url)} failed: ${errorReason(error)}`,
          ).pipe(Effect.as([])),
        ),
      )

    const listRelays: Effect.Effect<
      ReadonlyArray<RelayListing>,
      Error
    > = Effect.gen(function* () {
      const relaySockets = yield* refreshRelays
      if (Array.isReadonlyArrayEmpty(relaySockets)) {
        return yield* Effect.fail(new Error(NOT_CONNECTED_REASON))
      }

      return yield* Effect.forEach(
        relaySockets,
        relaySocket =>
          Effect.map(listRelayRuntimes(relaySocket), runtimes => ({
            relaySocket,
            runtimes,
          })),
        { concurrency: 'unbounded' },
      )
    })

    const listRuntimes: Effect.Effect<
      ReadonlyArray<ListedRuntime>,
      Error
    > = Effect.map(listRelays, listings =>
      Array.flatMap(listings, ({ relaySocket, runtimes }) =>
        Array.map(runtimes, runtime => ({
          runtime,
          maybeProjectRoot: relaySocket.target.maybeProjectRoot,
        })),
      ),
    )

    const sendRequest = (
      request: typeof Request.Type,
      maybeRuntimeId: Option.Option<string>,
    ): Effect.Effect<typeof Response.Type, Cause.TimeoutError | Error> =>
      Effect.gen(function* () {
        const listings = yield* listRelays
        const route = yield* routeFromListings(listings, maybeRuntimeId)
        return yield* exchange(
          route.socket,
          request,
          Option.some(route.connectionId),
          REQUEST_TIMEOUT,
        )
      })

    const close: Effect.Effect<void> = refreshLock.withPermits(1)(
      Effect.gen(function* () {
        yield* Ref.set(isClosedRef, true)
        const sockets = yield* Ref.getAndSet(socketsRef, HashMap.empty())
        yield* Effect.sync(() => {
          for (const { socket } of HashMap.values(sockets)) {
            socket.terminate()
          }
        })
      }),
    )

    const client: RelayClient = { listRuntimes, sendRequest, close }
    return client
  })

const routeToRuntime = (
  listings: ReadonlyArray<RelayListing>,
  runtimeId: string,
): Effect.Effect<RuntimeRoute, Error> =>
  Option.match(
    Array.findLast(listings, ({ runtimes }) =>
      Array.some(runtimes, ({ connectionId }) => connectionId === runtimeId),
    ),
    {
      onNone: () =>
        Effect.fail(
          new Error(
            `No connected Foldkit Runtime has the id ${runtimeId}. Call foldkit_list_runtimes for the current ids.`,
          ),
        ),
      onSome: ({ relaySocket }) =>
        Effect.succeed({
          socket: relaySocket.socket,
          connectionId: runtimeId,
        }),
    },
  )

const routeToDefaultRuntime = (
  listings: ReadonlyArray<RelayListing>,
): Effect.Effect<RuntimeRoute, Error> =>
  Option.match(
    pipe(
      listings,
      Array.flatMap(({ relaySocket, runtimes }) =>
        Array.map(runtimes, ({ connectionId }) => ({
          socket: relaySocket.socket,
          connectionId,
        })),
      ),
      Array.last,
    ),
    {
      onNone: () => Effect.fail(new Error(NO_RUNTIMES_REASON)),
      onSome: Effect.succeed,
    },
  )

const routeFromListings = (
  listings: ReadonlyArray<RelayListing>,
  maybeRuntimeId: Option.Option<string>,
): Effect.Effect<RuntimeRoute, Error> =>
  Option.match(maybeRuntimeId, {
    onNone: () => routeToDefaultRuntime(listings),
    onSome: runtimeId => routeToRuntime(listings, runtimeId),
  })

const handleIncomingMessage = (
  raw: RawData,
  pendingResponsesRef: Ref.Ref<PendingResponses>,
): Effect.Effect<void> => {
  const decoded = Schema.decodeExit(Schema.fromJsonString(ResponseFrame))(
    raw.toString(),
  )
  return Exit.match(decoded, {
    onFailure: error =>
      Effect.sync(() =>
        console.error('[foldkit-devtools-mcp] failed to decode frame', error),
      ),
    onSuccess: responseFrame =>
      Effect.gen(function* () {
        const map = yield* Ref.get(pendingResponsesRef)
        const maybeDeferred = HashMap.get(map, responseFrame.id)
        yield* Option.match(maybeDeferred, {
          onNone: () => Effect.void,
          onSome: deferred =>
            Effect.gen(function* () {
              yield* Ref.update(
                pendingResponsesRef,
                HashMap.remove(responseFrame.id),
              )
              yield* Deferred.succeed(deferred, responseFrame.response)
            }),
        })
      }),
  })
}
