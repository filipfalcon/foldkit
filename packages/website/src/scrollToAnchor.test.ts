import { Effect, Option } from 'effect'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ScrollToAnchor } from './main'
import { Message } from './message'

const landOn = (hash: string): Promise<Message> =>
  Effect.runPromise(ScrollToAnchor({ hash }).effect)

const elementById = (id: string): HTMLElement =>
  Option.getOrThrow(Option.fromNullishOr(document.getElementById(id)))

describe('ScrollToAnchor', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(
      () => {},
    )
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  test('lands on an id written with non-ASCII characters', async () => {
    document.body.innerHTML = '<h2 id="súpiska">Súpiska</h2>'

    const message = await landOn('s%C3%BApiska')

    const target = elementById('súpiska')
    expect(message).toStrictEqual(Message.CompletedScrollToAnchor())
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(document.activeElement).toBe(target)
    expect(target.getAttribute('tabindex')).toBe('-1')
  })

  test('lands on an id containing a space', async () => {
    document.body.innerHTML = '<h2 id="match report">Match report</h2>'

    await landOn('match%20report')

    expect(document.activeElement).toBe(elementById('match report'))
  })

  test('prefers an id that matches the hash as written over its decoded form', async () => {
    document.body.innerHTML = [
      '<h2 id="100 off">Decoded</h2>',
      '<h2 id="100%20off">Literal</h2>',
    ].join('')

    await landOn('100%20off')

    expect(document.activeElement).toBe(elementById('100%20off'))
  })

  test('lands on the first anchor named by the hash', async () => {
    document.body.innerHTML = [
      '<input name="results" />',
      '<a name="results">First</a>',
      '<a name="results">Second</a>',
    ].join('')

    await landOn('results')

    expect(document.activeElement).toBe(document.querySelector('a'))
  })

  test('lands on an element with the id top', async () => {
    document.body.innerHTML = '<h2 id="top">Top</h2>'

    await landOn('top')

    expect(document.activeElement).toBe(elementById('top'))
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  test('scrolls to the top without moving focus when no element has the id top', async () => {
    document.body.innerHTML = '<button id="menu">Menu</button>'
    elementById('menu').focus()

    await landOn('top')

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'instant',
    })
    expect(document.activeElement).toBe(elementById('menu'))
  })

  test('matches top in any case after decoding', async () => {
    await landOn('T%6FP')

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'instant',
    })
  })

  test('leaves the page alone when a malformed hash matches nothing', async () => {
    document.body.innerHTML = '<button id="menu">Menu</button>'
    elementById('menu').focus()

    const message = await landOn('%E9%')

    expect(message).toStrictEqual(Message.CompletedScrollToAnchor())
    expect(window.scrollTo).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(elementById('menu'))
  })
})
