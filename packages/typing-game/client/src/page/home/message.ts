import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

import * as Shared from '@typing-game/shared'

export const Message = messages({
  CompletedFocusUsernameInput: {},
  CompletedFocusRoomIdInput: {},
  SubmittedUsernameForm: {},
  ChangedUsername: { value: S.String },
  BlurredUsernameInput: {},
  ChangedRoomId: { value: S.String },
  BlurredRoomIdInput: {},
  SubmittedJoinRoomForm: {},
  SucceededCreateRoom: { roomId: S.String, player: Shared.Player },
  SucceededJoinRoom: { roomId: S.String, player: Shared.Player },
  FailedCreateRoom: { error: S.String },
  FailedJoinRoom: { error: S.String },
  PressedKey: { key: S.String },
})

export const {
  CompletedFocusUsernameInput,
  CompletedFocusRoomIdInput,
  SubmittedUsernameForm,
  ChangedUsername,
  BlurredUsernameInput,
  ChangedRoomId,
  BlurredRoomIdInput,
  SubmittedJoinRoomForm,
  SucceededCreateRoom,
  SucceededJoinRoom,
  FailedCreateRoom,
  FailedJoinRoom,
  PressedKey,
} = Message
export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = messages({
  CreatedRoom: { roomId: S.String, player: Shared.Player },
  JoinedRoom: { roomId: S.String, player: Shared.Player },
})

export const { CreatedRoom, JoinedRoom } = OutMessage
export type OutMessage = typeof OutMessage.Type
