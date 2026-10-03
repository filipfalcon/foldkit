import { Option } from 'effect'
import { Scene, Story } from 'foldkit'
import { LoadType, UrlChangeType } from 'foldkit/navigation'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import {
  Message,
  Model,
  RestoreScrollPosition,
  ScrollToTop,
  init,
  update,
  view,
} from './main'
import { AppRoute } from './route'

const initialModel = Model.make({ route: AppRoute.Home(), count: 0 })

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    fromString(raw),
    () => new Error(`Failed to parse url: ${raw}`),
  )

describe('view', () => {
  test('renders the statically generated home page', () => {
    Scene.scene(
      { update, view },
      Scene.given(initialModel),
      Scene.expect(Scene.text('Statically generated home')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Count: 0' })).toExist(),
    )
  })

  test('clicking the counter increments the count', () => {
    Scene.scene(
      { update, view },
      Scene.given(initialModel),
      Scene.click(Scene.role('button', { name: 'Count: 0' })),
      Scene.expect(Scene.role('button', { name: 'Count: 1' })).toExist(),
    )
  })
})

describe('ChangedUrl', () => {
  test('a link to another page scrolls to the top', () => {
    Story.story(
      update,
      Story.given(initialModel),
      Story.message(
        Message.ChangedUrl({
          url: urlOrThrow('http://localhost/about'),
          urlChangeType: UrlChangeType.Push(),
        }),
      ),
      Story.model(model => {
        expect(model.route).toStrictEqual(AppRoute.About())
      }),
      Story.Command.expectExact(ScrollToTop()),
      Story.Command.resolve(ScrollToTop, Message.CompletedScrollToTop()),
    )
  })

  test('a link to the current page keeps the scroll position', () => {
    Story.story(
      update,
      Story.given(initialModel),
      Story.message(
        Message.ChangedUrl({
          url: urlOrThrow('http://localhost/?ref=nav'),
          urlChangeType: UrlChangeType.Push(),
        }),
      ),
      Story.Command.expectNone(),
    )
  })

  test('Back and Forward restore the position the reader left', () => {
    Story.story(
      update,
      Story.given(initialModel),
      Story.message(
        Message.ChangedUrl({
          url: urlOrThrow('http://localhost/about'),
          urlChangeType: UrlChangeType.Traverse({
            maybeSavedScrollPosition: Option.some({ x: 0, y: 1500 }),
          }),
        }),
      ),
      Story.Command.expectExact(RestoreScrollPosition({ x: 0, y: 1500 })),
      Story.Command.resolve(
        RestoreScrollPosition,
        Message.CompletedRestoreScrollPosition(),
      ),
    )
  })
})

describe('init', () => {
  test('builds the same Model from the build URL and the reader URL', () => {
    const buildInit = init(
      urlOrThrow('http://localhost/about'),
      LoadType.Push(),
    )
    const readerInit = init(
      urlOrThrow('https://example.com/about/?ref=newsletter#team'),
      LoadType.Reload({
        maybeSavedScrollPosition: Option.some({ x: 0, y: 2400 }),
      }),
    )

    expect(readerInit.model).toStrictEqual(buildInit.model)
  })
})
