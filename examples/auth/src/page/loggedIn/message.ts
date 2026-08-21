import { messages } from 'foldkit/message'

// MESSAGE

export const Message = messages({
  ClickedLogout: {},
})

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = messages({
  RequestedLogout: {},
})

export type OutMessage = typeof OutMessage.Type
