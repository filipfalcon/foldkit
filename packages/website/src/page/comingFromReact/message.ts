import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

export const Message = messages({
  ToggledFaq: {
    id: S.String,
    isOpen: S.Boolean,
  },
})

export type Message = typeof Message.Type
