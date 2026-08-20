import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

// MESSAGE

/** Union of all messages the tooltip component can produce. */
export const Message = messages({
  EnteredTrigger: {},
  LeftTrigger: {},
  FocusedTrigger: {},
  BlurredTrigger: {},
  PressedEscape: {},
  PressedPointerOnTrigger: {
    pointerType: S.String,
  },
  CompletedWaitBeforeShowing: {
    version: S.Number,
  },
  CompletedAnchorTooltip: {},
})

/** Sent when the pointer enters the tooltip trigger. */
export const { EnteredTrigger } = Message

/** Sent when the pointer leaves the tooltip trigger. */
export const { LeftTrigger } = Message

/** Sent when focus enters the trigger. */
export const { FocusedTrigger } = Message

/** Sent when focus leaves the trigger. */
export const { BlurredTrigger } = Message

/** Sent when Escape is pressed while the tooltip is visible. */
export const { PressedEscape } = Message

/** Sent when a pointer presses the trigger. Recorded so the focus that
 *  follows a mouse press can be told apart from focus that affirms the
 *  tooltip (keyboard, touch, or pen). */
export const { PressedPointerOnTrigger } = Message

/** Sent when the show-delay timer fires. */
export const { CompletedWaitBeforeShowing } = Message

/** Sent when the tooltip panel mounts and Floating UI has positioned it. */
export const { CompletedAnchorTooltip } = Message

export type EnteredTrigger = typeof Message.EnteredTrigger.Type
export type LeftTrigger = typeof Message.LeftTrigger.Type
export type FocusedTrigger = typeof Message.FocusedTrigger.Type
export type BlurredTrigger = typeof Message.BlurredTrigger.Type
export type PressedEscape = typeof Message.PressedEscape.Type
export type PressedPointerOnTrigger =
  typeof Message.PressedPointerOnTrigger.Type

export type Message = typeof Message.Type

// OUT MESSAGE

/** Union of out-messages the tooltip component can produce. */
export const OutMessage = messages({
  Shown: {},
  Hidden: {},
})

/** Emitted once the tooltip transitions to visible (`isOpen` becomes true).
 *  Consumers typically use this for analytics, instrumentation, or to
 *  coordinate with other transient UI. */
export const { Shown } = OutMessage

/** Emitted once the tooltip transitions to hidden (`isOpen` becomes false). */
export const { Hidden } = OutMessage

export type Shown = typeof OutMessage.Shown.Type
export type Hidden = typeof OutMessage.Hidden.Type
export type OutMessage = typeof OutMessage.Type
