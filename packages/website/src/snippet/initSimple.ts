import { Schema as S } from 'effect'
import type { Runtime } from 'foldkit'
import { messages } from 'foldkit/message'

const Model = S.Struct({
  count: S.Number,
})
type Model = typeof Model.Type

const Message = messages({
  ClickedIncrement: {},
  ClickedDecrement: {},
})
type Message = typeof Message.Type

const init: Runtime.ApplicationInit<Model, Message> = () => [{ count: 0 }, []]
