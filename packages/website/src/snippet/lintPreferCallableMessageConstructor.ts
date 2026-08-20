import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

const Message = messages({
  ClickedSave: {},
})
type Message = typeof Message.Type

// ❌ Bad
const badMessage: Message = {
  _tag: 'ClickedSave',
}

// ✅ Good
const goodMessage = Message.ClickedSave()
