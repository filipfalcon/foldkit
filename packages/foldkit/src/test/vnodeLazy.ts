import type { HtmlBuilder } from '../html/index.js'
import {
  createKeyedLazy as createHtmlKeyedLazy,
  createLazy as createHtmlLazy,
} from '../html/lazy.js'
import {
  type SubmodelView,
  defineView as defineHtmlView,
} from '../html/submodel.js'
import type { VNode } from '../vdom.js'

// NOTE: tests that build renderer nodes directly, which is what Html is at
// runtime, use these retyped entry points. Retyping the entry points, rather
// than wrapping each view, keeps every view function reference intact, and
// those references are the lazy cache key.

type VNodeLazy = <Args extends ReadonlyArray<unknown>>(
  fn: (...args: Args) => VNode | null,
  args: Args,
) => VNode | null

type VNodeKeyedLazy = <Args extends ReadonlyArray<unknown>>(
  key: PropertyKey,
  fn: (...args: Args) => VNode | null,
  args: Args,
) => VNode | null

type VNodeView<Model, Message, ViewInputs> = [ViewInputs] extends [void]
  ? (model: Model, h: HtmlBuilder<Message>) => VNode | null
  : (
      model: Model,
      viewInputs: ViewInputs,
      h: HtmlBuilder<Message>,
    ) => VNode | null

/** `createLazy` typed with renderer nodes, for tests that build them directly.
 *
 * @internal */
export const createLazy = (): VNodeLazy =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  createHtmlLazy() as unknown as VNodeLazy

/** `createKeyedLazy` typed with renderer nodes, for tests that build them
 *  directly.
 *
 * @internal */
export const createKeyedLazy = (): VNodeKeyedLazy =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  createHtmlKeyedLazy() as unknown as VNodeKeyedLazy

/** `defineView` typed with renderer nodes, for tests that build them directly.
 *
 * @internal */
export const defineView = <Model, Message = never, ViewInputs = void>(
  fn: VNodeView<Model, Message, ViewInputs>,
): SubmodelView<Model, Message, ViewInputs> =>
  defineHtmlView<Model, Message, ViewInputs>(
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    fn as unknown as Parameters<
      typeof defineHtmlView<Model, Message, ViewInputs>
    >[0],
  )
