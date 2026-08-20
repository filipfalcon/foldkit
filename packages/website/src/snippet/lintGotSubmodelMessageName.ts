import { messages } from 'foldkit/message'

import * as Child from './child'

// ❌ Bad
const BadMessage = messages({
  ChildChanged: {
    message: Child.Message,
  },
})

// ✅ Good
const Message = messages({
  GotChildMessage: {
    message: Child.Message,
  },
})
