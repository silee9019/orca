import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_FILE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['file', 'list'],
    summary: 'List workspace files',
    usage: 'orca file list --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace"}'
    ]
  },
  {
    path: ['file', 'read'],
    summary: 'Read a workspace file',
    usage: 'orca file read --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","relativePath":"notes.md"}'
    ]
  },
  {
    path: ['file', 'preview'],
    summary: 'Read a bounded file preview',
    usage: 'orca file preview --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","relativePath":"image.png"}'
    ]
  },
  {
    path: ['file', 'read-chunk'],
    summary: 'Read a bounded file chunk',
    usage: 'orca file read-chunk --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath, offset, length.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","relativePath":"large.log","offset":0,"length":1024}'
    ]
  },
  {
    path: ['file', 'read-dir'],
    summary: 'List a workspace directory',
    usage: 'orca file read-dir --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, followSymlinks (optional), relativePath (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","relativePath":""}'
    ]
  },
  {
    path: ['file', 'search'],
    summary: 'Search file contents on the workspace host',
    usage: 'orca file search --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, query, caseSensitive (optional), wholeWord (optional), useRegex (optional), includePattern (optional), excludePattern (optional), maxResults (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","query":"TODO"}'
    ]
  },
  {
    path: ['file', 'search-paths'],
    summary: 'Search workspace file paths',
    usage: 'orca file search-paths --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, allowLegacyIncludeIgnored (optional), includeIgnored (optional), followSymlinks (optional), query (optional), limit (optional), excludePaths (optional), mode (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","query":"notes"}'
    ]
  },
  {
    path: ['file', 'list-all'],
    summary: 'List workspace paths with ignore and symlink options',
    usage: 'orca file list-all --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, candidatePaths (optional), includeIgnored (optional), followSymlinks (optional), excludePaths (optional), maxResults (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","maxResults":100}'
    ]
  },
  {
    path: ['file', 'markdown-documents'],
    summary: 'List workspace Markdown documents',
    usage: 'orca file markdown-documents --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace"}'
    ]
  },
  {
    path: ['file', 'exists'],
    summary: 'Check workspace file paths',
    usage: 'orca file exists --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePaths.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","relativePaths":["notes.md"]}'
    ]
  },
  {
    path: ['file', 'stat'],
    summary: 'Inspect workspace path metadata',
    usage: 'orca file stat --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, followSymlinks (optional), relativePath (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","relativePath":"notes.md"}'
    ]
  },
  {
    path: ['file', 'browse-server-dir'],
    summary: 'Browse directories on the selected Orca server',
    usage: 'orca file browse-server-dir --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: path (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"path":"/srv"}'
    ]
  },
  {
    path: ['file', 'read-doc-preview'],
    summary: 'Read a document preview within its authorized roots',
    usage: 'orca file read-doc-preview --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath, entryRelativePath, implicitRootRelativePath, authorizedRootRelativePaths.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","relativePath":"docs/a.html","entryRelativePath":"docs/a.html","implicitRootRelativePath":"docs","authorizedRootRelativePaths":[]}'
    ]
  },
  {
    path: ['file', 'write'],
    summary: 'Write a workspace file, including an explicit empty file',
    usage: 'orca file write --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional), content.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","expectedExecutionHostId":"local","relativePath":"notes.md","content":""}'
    ]
  },
  {
    path: ['file', 'write-base64'],
    summary: 'Write-base64 a path on the workspace host',
    usage: 'orca file write-base64 --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional), contentBase64.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","expectedExecutionHostId":"local","relativePath":"notes.md","contentBase64":"YWJj"}'
    ]
  },
  {
    path: ['file', 'append-base64'],
    summary: 'Append-base64 a path on the workspace host',
    usage: 'orca file append-base64 --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional), contentBase64, append (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","expectedExecutionHostId":"local","relativePath":"notes.md","contentBase64":"YWJj","append":true}'
    ]
  },
  {
    path: ['file', 'create'],
    summary: 'Create a path on the workspace host',
    usage: 'orca file create --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","expectedExecutionHostId":"local","relativePath":"notes.md"}'
    ]
  },
  {
    path: ['file', 'mkdir'],
    summary: 'Create a directory without replacing an existing path',
    usage: 'orca file mkdir --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, relativePath, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","expectedExecutionHostId":"local","relativePath":"notes.md"}'
    ]
  },
  {
    path: ['file', 'rename'],
    summary: 'Rename a path on the workspace host',
    usage: 'orca file rename --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional), oldRelativePath, newRelativePath.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","expectedExecutionHostId":"local","oldRelativePath":"old.md","newRelativePath":"new.md"}'
    ]
  },
  {
    path: ['file', 'copy'],
    summary: 'Copy a path on the workspace host',
    usage: 'orca file copy --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional), sourceRelativePath, destinationRelativePath.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","expectedExecutionHostId":"local","sourceRelativePath":"a.md","destinationRelativePath":"b.md"}'
    ]
  },
  {
    path: ['file', 'delete'],
    aliases: [['file', 'rm']],
    summary: 'Delete a path on the workspace host',
    usage: 'orca file delete --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: worktree, relativePath, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional), recursive (optional).',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","expectedExecutionHostId":"local","relativePath":"notes.md","recursive":false}',
      'Requires --confirm to exactly match the JSON field worktree.'
    ],
    destructive: true
  },
  {
    path: ['file', 'commit-upload'],
    summary: 'Commit-upload a path on the workspace host',
    usage: 'orca file commit-upload --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, expectedExecutionHostId, expectedSshTargetId (optional), expectedSshConnectionGeneration (optional), tempRelativePath, finalRelativePath.',
      'Read command parameters as JSON from a local file, or use --params-file - for stdin. Values are never taken from command-line JSON.',
      'The selected Orca runtime executes the operation. Worktree selectors may name Git or folder workspaces on native, SSH, or paired hosts; unavailable hosts fail without local fallback.',
      'File changes require expectedExecutionHostId; SSH changes also require expectedSshTargetId and expectedSshConnectionGeneration. The host enforces its existing path, permissions, and provider rules. A missing old-host method fails explicitly and is never retried as a mutation.',
      'Input example: {"worktree":"path:/srv/workspace","expectedExecutionHostId":"local","tempRelativePath":".upload","finalRelativePath":"new.bin"}'
    ]
  }
]
