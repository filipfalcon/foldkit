import { Array, Effect, Option, Schema, String, pipe } from 'effect'
import { Command, Render, Runtime } from 'foldkit'
import { modifyFields } from 'foldkit/struct'
import { Url } from 'foldkit/url'

// One Command scrolls to the top of a new page...
const ScrollToTop = Command.define('ScrollToTop', {
  messages: [Message.CompletedScrollToTop],
  execute: Effect.sync(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    return Message.CompletedScrollToTop()
  }),
})

// ...a lookup finds the fragment's target the way the browser does...
const PERCENT_ENCODED_BYTE_SEPARATOR = /(%[0-9A-Fa-f]{2})/
const PERCENT_ENCODED_BYTE = /^%[0-9A-Fa-f]{2}$/
const HEXADECIMAL_RADIX = 16
const TOP_OF_DOCUMENT_FRAGMENT = /^top$/i

const toBytes = (piece: string): ReadonlyArray<number> =>
  PERCENT_ENCODED_BYTE.test(piece)
    ? [Number.parseInt(piece.slice(1), HEXADECIMAL_RADIX)]
    : Array.fromIterable(new TextEncoder().encode(piece))

const decodeFragment = (fragment: string): string =>
  pipe(
    fragment,
    String.split(PERCENT_ENCODED_BYTE_SEPARATOR),
    Array.flatMap(toBytes),
    bytes =>
      new TextDecoder('utf-8', { ignoreBOM: true }).decode(
        Uint8Array.from(bytes),
      ),
  )

const findPotentialIndicatedElement = (
  fragment: string,
): Option.Option<Element> =>
  pipe(
    Option.fromNullishOr(document.getElementById(fragment)),
    Option.orElse(() =>
      Array.findFirst(
        document.getElementsByName(fragment),
        element => element instanceof HTMLAnchorElement,
      ),
    ),
  )

const landOnElement = (element: Element): void => {
  element.scrollIntoView({ block: 'start' })

  if (element instanceof HTMLElement) {
    if (!element.hasAttribute('tabindex')) {
      element.setAttribute('tabindex', '-1')
    }
    element.focus({ preventScroll: true })
  }
}

// ...another lands on that target after paint and moves focus to it...
const ScrollToAnchor = Command.define('ScrollToAnchor', {
  args: { hash: Schema.String },
  messages: [Message.CompletedScrollToAnchor],
  execute: ({ hash }) =>
    Effect.gen(function* () {
      yield* Render.afterPaint

      const decodedHash = decodeFragment(hash)
      const maybeTarget = pipe(
        findPotentialIndicatedElement(hash),
        Option.orElse(() => findPotentialIndicatedElement(decodedHash)),
      )

      if (Option.isSome(maybeTarget)) {
        landOnElement(maybeTarget.value)
      } else if (TOP_OF_DOCUMENT_FRAGMENT.test(decodedHash)) {
        window.scrollTo({ top: 0, behavior: 'instant' })
      }

      return Message.CompletedScrollToAnchor()
    }),
})

// ...init lands on the fragment of a shared link...
const init: Runtime.RoutingApplicationInit<Model, Message> = (url: Url) => {
  const route = urlToAppRoute(url)

  return {
    model: { route, url },
    commands: [
      ...commandsForRoute(route),
      ...Option.match(url.hash, {
        onNone: () => [],
        onSome: hash => [ScrollToAnchor({ hash })],
      }),
    ],
  }
}

// ...and the ChangedUrl handler lands on it after navigation:
ChangedUrl: ({ url }) => {
  const route = urlToAppRoute(url)

  const maybeScrollToTop = Option.liftPredicate(
    ScrollToTop(),
    () => model.url.pathname !== url.pathname,
  )

  return {
    model: modifyFields(model, { route: () => route, url: () => url }),
    commands: [
      ...commandsForRoute(route),
      ...Option.match(url.hash, {
        onNone: () => Option.toArray(maybeScrollToTop),
        onSome: hash => [ScrollToAnchor({ hash })],
      }),
    ],
  }
}
