import { z } from 'zod'
import { toSshExecutionHostId } from '../../shared/execution-host'
import type { TerminalWorkspaceLaunchScope } from './runtime-legacy-worker-terminal-recovery-types'
export type TerminalLaunchScopePin = { worktreeId: string; executionHostId: string }
const InitialSize = z
  .object({ cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(1000) })
  .strict()
export function resolveTerminalSpawnInitialSize(value?: { cols: number; rows: number }): {
  cols: number
  rows: number
} {
  if (!value) {
    return { cols: 120, rows: 40 }
  }
  const parsed = InitialSize.safeParse(value)
  if (!parsed.success) {
    throw new Error('terminal_spawn_invalid_initial_size')
  }
  return parsed.data
}
export type TerminalCreateInitialSizeScope = {
  initialSize?: { cols: number; rows: number }
  presentation?: string
  rendererBacked?: boolean
}
// A renderer-backed or visible terminal sizes itself, so only a background workspace PTY may pin a grid.
export function resolveTerminalCreateInitialSize(
  opts: TerminalCreateInitialSizeScope,
  worktreeSelector: string | undefined
): { cols: number; rows: number } {
  const size = resolveTerminalSpawnInitialSize(opts.initialSize)
  if (
    opts.initialSize &&
    (!worktreeSelector || opts.presentation !== 'background' || opts.rendererBacked === true)
  ) {
    throw new Error('terminal_spawn_initial_size_requires_background_workspace')
  }
  return size
}
export function assertTerminalSpawnLaunchScope(
  scope: TerminalWorkspaceLaunchScope,
  pin?: TerminalLaunchScopePin
): void {
  if (!pin) {
    return
  }
  const host = scope.connectionId ? toSshExecutionHostId(scope.connectionId) : 'local'
  if (scope.id !== pin.worktreeId || host !== pin.executionHostId) {
    throw new Error('terminal_spawn_launch_scope_changed')
  }
}
