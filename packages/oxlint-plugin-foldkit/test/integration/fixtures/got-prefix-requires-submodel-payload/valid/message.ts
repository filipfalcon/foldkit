import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

import * as Child from './child'

const Message = messages({
  ReceivedWeather: {
  temperature: S.Number,
},
  GotChildMessage: {
  id: S.String,
  message: Child.Message,
},
})
