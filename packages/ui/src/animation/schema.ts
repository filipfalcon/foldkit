import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

// TRANSITION STATE

/** Schema for the animation lifecycle state, tracking enter/leave phases. */
export const TransitionState = S.Literals([
  'Idle',
  'EnterStart',
  'EnterAnimating',
  'LeaveStart',
  'LeaveAnimating',
])
export type TransitionState = typeof TransitionState.Type

// MODEL

/** Schema for the animation component's state, tracking its unique ID, visibility intent, and lifecycle phase. */
export const Model = S.Struct({
  id: S.String,
  isShowing: S.Boolean,
  transitionState: TransitionState,
})

export type Model = typeof Model.Type

// MESSAGE

/** Union of all messages the animation component can produce. */
export const Message = messages({
  Showed: {},
  Hid: {},
  CompletedWaitForPaint: {},
  EndedAnimation: {},
})

/** Sent when the animation should enter (become visible). Starts the enter sequence. */
export const { Showed } = Message

/** Sent when the animation should leave (become hidden). Starts the leave sequence. */
export const { Hid } = Message

/** Sent internally when a double-rAF completes, advancing the lifecycle to its animating phase. */
export const { CompletedWaitForPaint } = Message

/** Sent internally when all CSS animations on the element have settled. Covers both CSS transitions and CSS keyframe animations. */
export const { EndedAnimation } = Message
export type Message = typeof Message.Type

export type Showed = typeof Message.Showed.Type
export type Hid = typeof Message.Hid.Type

// OUT MESSAGE

export const OutMessage = messages({
  StartedLeaveAnimating: {},
  TransitionedOut: {},
})

/** Sent to the parent when the leave sequence advances to LeaveAnimating. The parent is responsible for providing the command that detects when the leave animation completes (e.g. WaitForAnimationSettled or a racing command). Use `defaultLeaveCommand` for the standard behavior. */
export const { StartedLeaveAnimating } = OutMessage

/** Sent to the parent when the leave animation completes. The parent can use this to unmount content or update its own state. */
export const { TransitionedOut } = OutMessage
export type OutMessage = typeof OutMessage.Type

// INIT

/** Configuration for creating an animation model with `init`. */
export type InitConfig = Readonly<{
  id: string
  isShowing?: boolean
}>

/** Creates an initial animation model from a config. Defaults to hidden. */
export const init = (config: InitConfig): Model => ({
  id: config.id,
  isShowing: config.isShowing ?? false,
  transitionState: 'Idle',
})
