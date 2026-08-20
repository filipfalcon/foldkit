import { Effect, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { messages } from 'foldkit/message'

// MESSAGE

const Message = messages({
  PressedKey: { key: S.String },
})
type Message = typeof Message.Type

// MODEL

const Model = S.Struct({
  isListening: S.Boolean,
})

type Model = typeof Model.Type

// SUBSCRIPTION

const subscriptions = Subscription.make<Model, Message>()(entry => ({
  shortcut: entry(
    { isListening: S.Boolean },
    {
      modelToDependencies: model => ({ isListening: model.isListening }),
      dependenciesToStream: ({ isListening }) =>
        Stream.when(
          Subscription.fromEvent<KeyboardEvent, Message>({
            target: window,
            type: 'keydown',
            toMessage: event => Message.PressedKey({ key: event.key }),
          }),
          Effect.sync(() => isListening),
        ),
    },
  ),
}))
