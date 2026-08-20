import { Effect } from 'effect'
import { messages } from 'foldkit/message'

const Message = messages({
  CompletedSaveDraft: {},
})

const saveDraftEffect = Effect.succeed(Message.CompletedSaveDraft())

export const SaveDraft = {
  name: 'SaveDraft',
  effect: saveDraftEffect,
}
