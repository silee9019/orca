import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_FOLDER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['folder-workspace', 'list'],
    summary: 'List folder workspaces on the selected runtime',
    usage: 'orca folder-workspace list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['folder-workspace', 'create'],
    summary: 'Create a folder workspace without requiring Git',
    usage: 'orca folder-workspace create --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: projectGroupId, name (optional), folderPath (optional), connectionId (optional), linkedTask (optional), linkedTaskSourceContext (optional), createdWithAgent (optional), pendingFirstAgentMessageRename (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"projectGroupId":"group-id","folderPath":"/srv/notes","name":"Notes"}'
    ]
  },
  {
    path: ['folder-workspace', 'update'],
    summary: 'Update a folder workspace without requiring Git',
    usage: 'orca folder-workspace update --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: folderWorkspaceId, updates.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"folderWorkspaceId":"folder-id","updates":{"name":"Notes"}}'
    ]
  },
  {
    path: ['folder-workspace', 'delete'],
    aliases: [['folder-workspace', 'rm']],
    summary: 'Delete a folder workspace without requiring Git',
    usage: 'orca folder-workspace delete --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: folderWorkspaceId.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"folderWorkspaceId":"folder-id"}',
      'Requires --confirm to exactly match the JSON field folderWorkspaceId.'
    ],
    destructive: true
  },
  {
    path: ['folder-workspace', 'path-status'],
    summary: 'Path-status a folder workspace without requiring Git',
    usage: 'orca folder-workspace path-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"scope":"path","path":"/srv/notes"}'
    ]
  }
]
