import { Option } from 'effect'
import { to, when } from 'foldkit/experimental/machine'
import { m } from 'foldkit/message'

const Idle = m('Idle')
const Running = m('Running')
type MachineState = typeof Idle.Type | typeof Running.Type
type IdleState = typeof Idle.Type

const Started = m('Started')
type MachineMessage = typeof Started.Type

export const startEdge = to<
  MachineState,
  MachineMessage,
  IdleState,
  MachineMessage,
  'Running'
>('Running', () => Running())

export const guardedStartEdge = when<
  MachineState,
  MachineMessage,
  IdleState,
  MachineMessage,
  Option.Option<number>,
  'Running'
>(
  state => Option.some(state._tag.length),
  'Running',
  () => Running(),
)
