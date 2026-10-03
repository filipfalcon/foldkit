import { Option } from 'effect'
import { click, expect, given, role, scene, text } from 'foldkit/scene'
import { fromString } from 'foldkit/url'
import { describe, test } from 'vitest'

import { Model, update, view } from './main'
import { AppRoute } from './route'

const initialModel = Model.make({
  route: AppRoute.Home(),
  url: Option.getOrThrow(fromString('http://localhost/')),
  count: 0,
})

describe('view', () => {
  test('renders the statically generated home page', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(text('Statically generated home')).toExist(),
      expect(role('button', { name: 'Count: 0' })).toExist(),
    )
  })

  test('clicking the counter increments the count', () => {
    scene(
      { update, view },
      given(initialModel),
      click(role('button', { name: 'Count: 0' })),
      expect(role('button', { name: 'Count: 1' })).toExist(),
    )
  })
})
