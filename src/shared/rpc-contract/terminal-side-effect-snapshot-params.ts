import { TerminalHandle } from './terminal-unary-params'

export const TerminalSideEffectSnapshotParams = TerminalHandle.pick({ terminal: true }).strict()
