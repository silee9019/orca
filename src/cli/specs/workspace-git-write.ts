import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GIT_WRITE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['git', 'abort-merge'],
    summary: 'Abort the current merge',
    usage: 'orca git abort-merge --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: worktree.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo"}',
      'Requires --confirm to exactly match the JSON field worktree.'
    ],
    destructive: true
  },
  {
    path: ['git', 'abort-rebase'],
    summary: 'Abort the current rebase',
    usage: 'orca git abort-rebase --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: worktree.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo"}',
      'Requires --confirm to exactly match the JSON field worktree.'
    ],
    destructive: true
  },
  {
    path: ['git', 'checkout'],
    summary: 'Check out a local branch',
    usage: 'orca git checkout --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, branch.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","branch":"feature"}'
    ]
  },
  {
    path: ['git', 'fetch'],
    summary: 'Fetch from the configured remote',
    usage: 'orca git fetch --params-file <file|-> [--json]',
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
    path: ['git', 'pull'],
    summary: 'Pull from the configured remote',
    usage: 'orca git pull --params-file <file|-> [--json]',
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
    path: ['git', 'fast-forward'],
    summary: 'Fast-forward to the upstream branch',
    usage: 'orca git fast-forward --params-file <file|-> [--json]',
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
    path: ['git', 'rebase'],
    summary: 'Rebase onto the selected base branch',
    usage: 'orca git rebase --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, baseRef.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","baseRef":"main"}'
    ]
  },
  {
    path: ['git', 'sync-fork'],
    summary: 'Sync the fork default branch with its expected upstream',
    usage: 'orca git sync-fork --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, expectedUpstream.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","expectedUpstream":{"owner":"owner","repo":"repo"}}'
    ]
  },
  {
    path: ['git', 'push'],
    summary: 'Push the selected workspace branch',
    usage: 'orca git push --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: worktree, publish (optional), forceWithLease (optional), pushTarget (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","publish":true}',
      'Requires --confirm to exactly match the JSON field worktree.'
    ],
    destructive: true
  },
  {
    path: ['git', 'commit'],
    summary: 'Commit the staged workspace changes',
    usage: 'orca git commit --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, message.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","message":"Update notes"}'
    ]
  },
  {
    path: ['git', 'stage'],
    summary: 'Stage selected paths',
    usage: 'orca git stage --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, filePaths.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","filePaths":["notes.md"]}'
    ]
  },
  {
    path: ['git', 'unstage'],
    summary: 'Unstage selected paths',
    usage: 'orca git unstage --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, filePaths.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","filePaths":["notes.md"]}'
    ]
  },
  {
    path: ['git', 'discard'],
    summary: 'Discard changes to selected paths',
    usage: 'orca git discard --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: worktree, filePaths.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/repo","filePaths":["notes.md"]}',
      'Requires --confirm to exactly match the JSON field worktree.'
    ],
    destructive: true
  }
]
