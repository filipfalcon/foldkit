import { Schema as S } from 'effect'
import { Subscription } from 'foldkit'
import { messages } from 'foldkit/message'

// MESSAGE

const Message = messages({
  TickedFrame: { deltaTime: S.Number },
  ClickedTogglePlay: {},
})
type Message = typeof Message.Type

// MODEL

const Model = S.Struct({
  isPlaying: S.Boolean,
  angle: S.Number,
})

type Model = typeof Model.Type

// SUBSCRIPTION

const subscriptions = Subscription.make<Model, Message>()(_entry => ({
  frame: Subscription.animationFrame({
    isActive: model => model.isPlaying,
    toMessage: deltaTime => Message.TickedFrame({ deltaTime }),
  }),
}))
