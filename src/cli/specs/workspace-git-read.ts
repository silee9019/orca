import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GIT_READ_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['git', 'status'],
    summary: 'Read Git status',
    usage: 'orca git status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, admissionTier (optional), includeIgnored (optional), includeLineStats (optional), bypassEffectiveUpstreamNegativeCache (optional), reuseLineStats (optional), branchLineTotalMergeBase (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo"}'
    ]
  },
  {
    path: ['git', 'history'],
    summary: 'Read bounded Git history',
    usage: 'orca git history --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, limit (optional), baseRef (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","limit":20}'
    ]
  },
  {
    path: ['git', 'diff'],
    summary: 'Read a staged or unstaged diff',
    usage: 'orca git diff --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, filePath, staged, compareAgainstHead (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","filePath":"notes.md","staged":false}'
    ]
  },
  {
    path: ['git', 'branch-compare'],
    summary: 'Compare the current branch against a base',
    usage: 'orca git branch-compare --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, admissionTier (optional), baseRef.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","baseRef":"main"}'
    ]
  },
  {
    path: ['git', 'commit-compare'],
    summary: 'Inspect a commit comparison',
    usage: 'orca git commit-compare --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, commitId.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","commitId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
    ]
  },
  {
    path: ['git', 'branch-diff'],
    summary: 'Read a file diff between branches',
    usage: 'orca git branch-diff --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, filePath, compare, oldPath (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","filePath":"a","compare":{"headOid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mergeBase":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}'
    ]
  },
  {
    path: ['git', 'commit-diff'],
    summary: 'Read a file diff for a commit',
    usage: 'orca git commit-diff --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, filePath, commitOid, parentOid (optional), oldPath (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","filePath":"a","commitOid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
    ]
  },
  {
    path: ['git', 'check-ignored'],
    summary: 'Check Git ignore rules',
    usage: 'orca git check-ignored --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, paths.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","paths":["notes.md"]}'
    ]
  },
  {
    path: ['git', 'submodule-status'],
    summary: 'Read a submodule status',
    usage: 'orca git submodule-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, submodulePath, area (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","submodulePath":"vendor"}'
    ]
  },
  {
    path: ['git', 'conflict-operation'],
    summary: 'Read the active merge or rebase',
    usage: 'orca git conflict-operation --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo"}'
    ]
  },
  {
    path: ['git', 'branches'],
    summary: 'List local branches',
    usage: 'orca git branches --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo"}'
    ]
  },
  {
    path: ['git', 'upstream-status'],
    summary: 'Read upstream status',
    usage: 'orca git upstream-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, pushTarget (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo"}'
    ]
  },
  {
    path: ['git', 'remote-file-url'],
    summary: 'Resolve the provider URL of a file',
    usage: 'orca git remote-file-url --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath, line.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","relativePath":"notes.md","line":1}'
    ]
  },
  {
    path: ['git', 'remote-commit-url'],
    summary: 'Resolve the provider URL of a commit',
    usage: 'orca git remote-commit-url --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, sha.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
    ]
  }
]
