import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

import { DragAndDrop } from '@foldkit/ui'

export const Message = messages({
  GotDragAndDropMessage: {
    message: DragAndDrop.Message,
  },
  ClickedAddCard: { columnId: S.String },
  ChangedNewCardTitle: {
    value: S.String,
  },
  SubmittedNewCard: {},
  CancelledNewCard: {},
  CompletedGenerateCardId: {
    cardId: S.String,
    columnId: S.String,
    title: S.String,
  },
  CompletedSaveBoard: {},
  CompletedFocusAddCardInput: {},
})

export const {
  GotDragAndDropMessage,
  ClickedAddCard,
  ChangedNewCardTitle,
  SubmittedNewCard,
  CancelledNewCard,
  CompletedGenerateCardId,
  CompletedSaveBoard,
  CompletedFocusAddCardInput,
} = Message

export type Message = typeof Message.Type
