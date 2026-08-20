import { Effect } from 'effect'
import { Command } from 'foldkit'
import { messages } from 'foldkit/message'

const Message = messages({
  CompletedFetchUser: {},
})

// ❌ Bad
const SaveUser = Command.define('FetchUser', {
  messages: [Message.CompletedFetchUser],
  execute: Effect.succeed(Message.CompletedFetchUser()),
})

// ✅ Good
const FetchUser = Command.define('FetchUser', {
  messages: [Message.CompletedFetchUser],
  execute: Effect.succeed(Message.CompletedFetchUser()),
})
