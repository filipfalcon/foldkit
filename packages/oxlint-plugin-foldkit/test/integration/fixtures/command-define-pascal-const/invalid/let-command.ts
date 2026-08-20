import { Effect } from 'effect'
import { Command } from 'foldkit'
import { messages } from 'foldkit/message'

const Message = messages({
  CompletedRefreshSession: {},
})

const refreshSessionEffect = Effect.succeed(Message.CompletedRefreshSession())

export let RefreshSession = Command.define('RefreshSession', {
  messages: [Message.CompletedRefreshSession],
  execute: refreshSessionEffect,
})
