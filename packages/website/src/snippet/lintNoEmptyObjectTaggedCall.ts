import { messages } from 'foldkit/message'

const Message = messages({
  ClickedSave: {},
})

// ❌ Bad
const badMessage = Message.ClickedSave({})

// ✅ Good
const goodMessage = Message.ClickedSave()
