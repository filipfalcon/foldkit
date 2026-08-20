import { messages } from 'foldkit/message'

import * as Child from './child'

const Message = messages({
  OpenedChild: {},
  ChildChanged: {
  message: Child.Message,
},
})
