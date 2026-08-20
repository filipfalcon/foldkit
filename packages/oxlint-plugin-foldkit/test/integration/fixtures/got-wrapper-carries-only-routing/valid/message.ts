import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'
import { Counter } from './counter'

// MESSAGE

const Message = messages({
  GotCounterMessage: {
  id: S.String,
  message: Counter.Message,
},
})
