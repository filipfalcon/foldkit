import { messages } from 'foldkit/message'

// ❌ Bad
const BadMessage = messages({
  NoOp: {},
})

// ✅ Good
const Message = messages({
  ClickedSave: {},
})
