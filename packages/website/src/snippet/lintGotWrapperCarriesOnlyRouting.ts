import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

// ❌ Bad
// A Got wrapper carries the child Message plus routing context only. Extra
// payload like timestamp belongs on the child Message or a parent Message.
const BadMessage = messages({
  GotSettingsMessage: {
    message: Settings.Message,
    timestamp: S.Number,
  },
})

// ✅ Good
// message plus routing keys (id, or keys ending in Id) only.
const Message = messages({
  GotCounterMessage: {
    id: S.String,
    message: Counter.Message,
  },
})
