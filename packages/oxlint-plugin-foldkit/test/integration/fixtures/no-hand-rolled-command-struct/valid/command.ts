import { Effect } from 'effect'
import { Command } from 'foldkit'
import { messages } from 'foldkit/message'

const Message = messages({
  CompletedSaveDraft: {},
})

const saveDraftEffect = Effect.succeed(Message.CompletedSaveDraft())

export const SaveDraft = Command.define('SaveDraft', {
  messages: [Message.CompletedSaveDraft],
  execute: saveDraftEffect,
})
