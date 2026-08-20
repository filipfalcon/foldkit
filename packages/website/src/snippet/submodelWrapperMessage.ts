import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

import * as Settings from './page/settings'

export const Message = messages({
  GotSettingsMessage: {
    message: Settings.Message,
  },
})

export const { GotSettingsMessage } = Message

export type Message = typeof Message.Type
