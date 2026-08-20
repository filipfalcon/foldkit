import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

const Message = messages({
  GotWeather: {
  temperature: S.Number,
},
})
