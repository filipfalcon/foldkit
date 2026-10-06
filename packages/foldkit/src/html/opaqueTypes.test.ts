import { Option, Predicate, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

import { defineMessageUnion } from '../message/index.js'
import { type View, defineView } from '../submodel/public.js'
import * as Scene from '../test/scene.js'
import {
  type Attribute,
  type ChildAttribute,
  type Html,
  type HtmlBuilder,
  childAttributes,
  inertHtml,
} from './index.js'
import { createKeyedLazy, createLazy } from './lazy.js'

// MESSAGE

const Message = defineMessageUnion({
  ClickedButton: {},
  UpdatedName: { value: Schema.String },
})
type Message = typeof Message.Type

const OtherMessage = defineMessageUnion({
  ClickedElsewhere: {},
})
type OtherMessage = typeof OtherMessage.Type

// TYPE CHECKS

const checkHtmlIsOpaque = () => {
  const greeting = (name: string): Html => inertHtml.p([], [`Hello, ${name}`])
  const page: Html = inertHtml.main([], [greeting('Ada'), null])
  const isNothing: boolean = page === null

  if (page !== null) {
    // @ts-expect-error Html exposes no selector
    void page.sel
    // @ts-expect-error Html exposes no renderer data
    void page.data
    // @ts-expect-error Html exposes no children array
    void page.children
    // @ts-expect-error Html exposes no live DOM element
    void page.elm
    // @ts-expect-error Html exposes no key
    void page.key
    // @ts-expect-error Html exposes no text
    void page.text
  }

  const nodeShaped = {
    sel: 'div',
    data: {},
    children: [],
    elm: undefined,
    text: undefined,
    key: undefined,
  }
  // @ts-expect-error Html cannot be forged from a node-shaped object
  const forged: Html = nodeShaped

  const lazyResult = createLazy()(greeting, ['Ada'])
  const lazyAsHtml: Html = lazyResult
  if (lazyResult !== null) {
    // @ts-expect-error a createLazy result exposes no children array
    void lazyResult.children
  }

  const keyedResult = createKeyedLazy()('ada', greeting, ['Ada'])
  if (keyedResult !== null) {
    // @ts-expect-error a createKeyedLazy result exposes no renderer data
    void keyedResult.data
  }

  const counterView: View<number, never> = defineView<number>((count, h) =>
    h.span([], [String(count)]),
  )
  const counterResult = counterView(1, inertHtml)
  const counterAsHtml: Html = counterResult
  if (counterResult !== null) {
    // @ts-expect-error a Submodel view result exposes no selector
    void counterResult.sel
  }

  return [isNothing, forged, lazyAsHtml, keyedResult, counterAsHtml]
}

const checkSceneElementIsOpaque = () =>
  Scene.scene(
    {
      update: (model: number, _message: Message) => ({ model: model + 1 }),
      view: (model: number, h: HtmlBuilder<Message>) =>
        h.button([h.OnClick(Message.ClickedButton())], [String(model)]),
    },
    Scene.given(0),
    Scene.tap(simulation => {
      // @ts-expect-error the rendered Scene tree exposes no children array
      void simulation.html.children
      // @ts-expect-error the rendered Scene tree exposes no selector
      void simulation.html.sel

      const maybeButton = Scene.find(simulation.html, 'button')
      if (Option.isSome(maybeButton)) {
        // @ts-expect-error a found Scene element exposes no renderer data
        void maybeButton.value.data
      }

      const maybeByRole = Scene.role('button')(simulation.html)
      if (Option.isSome(maybeByRole)) {
        // @ts-expect-error a Locator result exposes no renderer data
        void maybeByRole.value.data
      }

      const text: string = Scene.textContent(simulation.html)
      const maybeType: Option.Option<string> = Option.flatMap(
        maybeButton,
        element => Scene.attr(element, 'type'),
      )
      void text
      void maybeType
    }),
  )

const checkAttributeIsOpaque = (
  h: HtmlBuilder<Message>,
  other: HtmlBuilder<OtherMessage>,
) => {
  const buttonAttributes: ReadonlyArray<Attribute<Message>> = [
    h.Class('button'),
    h.OnClick(Message.ClickedButton()),
    h.OnInput(value => Message.UpdatedName({ value })),
  ]
  const markup: Attribute<Message> = h.InnerHTML('<b>trusted</b>')
  const button = h.button([...buttonAttributes, h.Type('button')], ['Go'])
  const article = h.article([markup])

  const click = h.OnClick(Message.ClickedButton())
  // @ts-expect-error an Attribute exposes no tag
  void click._tag
  // @ts-expect-error an Attribute exposes no Message payload
  void click.message
  const input = h.OnInput(value => Message.UpdatedName({ value }))
  // @ts-expect-error an Attribute exposes no handler function
  void input.f
  const className = h.Class('button')
  // @ts-expect-error an Attribute exposes no value
  void className.value

  // @ts-expect-error an Attribute cannot be forged from its representation
  const forged: Attribute<Message> = { _tag: 'Class', value: 'forged' }

  // @ts-expect-error a textarea rejects InnerHTML content
  const textarea = h.textarea([h.InnerHTML('<b>no</b>')])
  // @ts-expect-error a keyed textarea rejects InnerHTML content
  const keyedTextarea = h.keyed('textarea')('notes', [h.InnerHTML('<b>no</b>')])

  const elsewhere = other.OnClick(OtherMessage.ClickedElsewhere())
  // @ts-expect-error an Attribute of another Message universe is rejected
  const mismatched: Attribute<Message> = elsewhere
  const inert: Attribute<Message> = inertHtml.Class('inert')
  const handlerFree: Attribute<OtherMessage> = h.Class('shared')

  const group: ReadonlyArray<ChildAttribute> = childAttributes([
    h.Class('child'),
  ])
  const firstChild = group[0]
  if (firstChild !== undefined) {
    // @ts-expect-error a ChildAttribute exposes no wrapped attribute
    void firstChild.attribute
    // @ts-expect-error a ChildAttribute exposes no dispatcher
    void firstChild.dispatch
  }
  const withGroup = h.div([...group])

  return [
    button,
    article,
    forged,
    textarea,
    keyedTextarea,
    mismatched,
    inert,
    handlerFree,
    withGroup,
  ]
}

// TEST

describe('opaque view types', () => {
  it('declares the type checks for Html, Scene elements, and attributes', () => {
    expect(
      [
        checkHtmlIsOpaque,
        checkSceneElementIsOpaque,
        checkAttributeIsOpaque,
      ].every(Predicate.isFunction),
    ).toBe(true)
  })
})
