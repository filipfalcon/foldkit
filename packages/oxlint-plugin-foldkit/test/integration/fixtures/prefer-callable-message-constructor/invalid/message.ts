import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'


const Message = messages({
  ClickedSave: {},
})
type Message = typeof Message.Type

const initialMessage: Message = {
  _tag: 'ClickedSave',
}
