import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_EXTERNAL_PATH_IMPORT_SPECS: CommandSpec[] = [
  {
    path: ['file', 'import-external-paths'],
    summary: 'Copy desktop-host files or folders into a workspace directory',
    usage: 'orca file import-external-paths --params-file <file|-> --confirm <destDir> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {sourcePaths (1-100 absolute paths on the desktop host), destDir, expectedExecutionHostId, connectionId?, expectedSshTargetId?, expectedSshConnectionGeneration?, ensureDir?, access?}. Sources are read from the desktop host filesystem; the client cwd and client files are never used. Confirmation must equal destDir.',
      'Reuses the original import: local destinations need the desktop root and symlink authorization, SSH destinations need the matching connected target and generation and use the existing upload session. Existing names are never overwritten (a copy name is chosen); symbolic links, missing and unsupported sources are skipped per item and a failed folder import is rolled back.',
      'Output lists each source with imported/skipped/failed, destination and rename flag, never file bytes; thrown failures are generic. No local fallback on SSH failure. Node hosts without the desktop service and old peers fail explicitly.'
    ]
  },
  {
    path: ['file', 'resolve-dropped-paths'],
    summary: 'Resolve desktop-host paths into paths an agent in a workspace can read',
    usage:
      'orca file resolve-dropped-paths --params-file <file|-> [--confirm <worktreePath>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {paths (1-100 absolute paths on the desktop host), worktreePath, expectedExecutionHostId, connectionId?, expectedSshTargetId?, expectedSshConnectionGeneration?}.',
      'Local workspaces return the paths unchanged, rewritten only for a WSL target, and perform no filesystem access. SSH workspaces upload each source into <worktreePath>/.orca/drops through the original import and return the remote paths; --confirm <worktreePath> is required then because the remote workspace is written.',
      'Output has resolvedPaths in input order plus per-source skipped and failed entries, never file bytes. Old peers and Node hosts without the desktop service fail explicitly.'
    ]
  }
]
