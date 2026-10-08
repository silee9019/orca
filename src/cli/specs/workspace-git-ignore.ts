import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GIT_IGNORE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['git', 'ignore-candidates'],
    summary: 'List dependency and build folders not ignored on the selected host',
    usage: 'orca git ignore-candidates --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree. Pass JSON in a file or --params-file - for stdin.',
      'Checks node_modules, .next, dist, build, target and vendor using the selected host directory and Git services. Host and Git errors fail without local fallback.'
    ]
  },
  {
    path: ['git', 'ignore-folder'],
    summary: 'Append an allowed folder pattern to the selected host .gitignore',
    usage: 'orca git ignore-folder --params-file <file|-> --confirm <worktree:folderName> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: worktree, folderName, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional). Pass JSON in a file or --params-file - for stdin.',
      'folderName must be node_modules, .next, dist, build, target or vendor. Requires the exact --confirm target.',
      'Preserves existing content and skips an exact existing folder pattern. changed:false reports a read-only no-op; host mutation expectations are checked whenever a write is needed.',
      'SSH writes require the expected SSH target and connection generation. Missing providers and old methods fail without local fallback.'
    ]
  }
]
