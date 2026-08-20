import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'
import { Settings } from './settings'

// MESSAGE

const Message = messages({
  GotSettingsMessage: {
  message: Settings.Message,
  timestamp: S.Number,
},
})
