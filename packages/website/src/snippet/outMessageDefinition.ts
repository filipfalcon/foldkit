import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

// MESSAGE

export const Message = messages({
  SubmittedLoginForm: {},
  SucceededAuthenticate: {
    sessionId: S.String,
  },
})

export const { SubmittedLoginForm, SucceededAuthenticate } = Message

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = messages({
  SucceededLogin: {
    sessionId: S.String,
  },
})

export const { SucceededLogin } = OutMessage

export type OutMessage = typeof OutMessage.Type
