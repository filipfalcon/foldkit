import { messages } from 'foldkit/message'

// MESSAGE

export const Message = messages({
  ClickedLogout: {},
})

export const { ClickedLogout } = Message

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = messages({
  RequestedLogout: {},
})

export const { RequestedLogout } = OutMessage

export type OutMessage = typeof OutMessage.Type
