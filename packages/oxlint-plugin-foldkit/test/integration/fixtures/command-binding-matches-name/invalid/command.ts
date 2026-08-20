import { Effect } from 'effect'
import { Command } from 'foldkit'
import { messages } from 'foldkit/message'

const Message = messages({
  CompletedFetchUser: {},
})


export const SaveUser = Command.define('FetchUser', {
  messages: [Message.CompletedFetchUser],
  execute: Effect.succeed(Message.CompletedFetchUser()),
})
