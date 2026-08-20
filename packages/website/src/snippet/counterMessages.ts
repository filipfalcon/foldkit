import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

// MESSAGE

// messages() declares the union and its callable constructors together

const Message = messages({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {},
})
type Message = typeof Message.Type
