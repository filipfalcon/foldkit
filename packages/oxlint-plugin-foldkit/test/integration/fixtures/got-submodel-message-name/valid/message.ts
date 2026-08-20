import { messages } from 'foldkit/message'

import * as Child from './child'

const Message = messages({
  OpenedChild: {},
  GotChildMessage: {
  message: Child.Message,
},
})
