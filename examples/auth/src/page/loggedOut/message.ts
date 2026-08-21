import { messages } from 'foldkit/message'

import { Session } from '../../domain/session'
import * as Login from './page/login'

// MESSAGE

export const Message = messages({
  GotLoginMessage: { message: Login.Message },
})

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = messages({
  SucceededLogin: { session: Session },
})

export type OutMessage = typeof OutMessage.Type
