import type { TerminalCreateOptions } from './orca-runtime-create-terminal-dependencies'
import { resolveTerminalSpawnInitialSize } from './terminal-spawn-launch-scope'

export { assertTerminalSpawnLaunchScope } from './terminal-spawn-launch-scope'

// An explicit initial size is honored only for background workspace spawns.
export function admitTerminalSpawnSize(
  opts: Pick<TerminalCreateOptions, 'initialSize' | 'presentation' | 'rendererBacked'>,
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
