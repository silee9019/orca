import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_FILE_GIT_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-file',
    keys: [
      'file list',
      'file read',
      'file preview',
      'file read-chunk',
      'file read-dir',
      'file search',
      'file search-paths',
      'file list-all',
      'file markdown-documents',
      'file exists',
      'file stat',
      'file browse-server-dir',
      'file read-doc-preview',
      'file write',
      'file write-base64',
      'file append-base64',
      'file create',
      'file mkdir',
      'file rename',
      'file copy',
      'file delete',
      'file commit-upload'
    ],
    load: async () => (await import('./handlers/workspace-file.js')).WORKSPACE_FILE_HANDLERS
  },
  {
    name: 'workspace-git',
    keys: [
      'git status',
      'git history',
      'git diff',
      'git branch-compare',
      'git commit-compare',
      'git branch-diff',
      'git commit-diff',
      'git check-ignored',
      'git submodule-status',
      'git conflict-operation',
      'git abort-merge',
      'git abort-rebase',
      'git checkout',
      'git branches',
      'git upstream-status',
      'git fetch',
      'git pull',
      'git fast-forward',
      'git rebase',
      'git sync-fork',
      'git push',
      'git commit',
      'git stage',
      'git unstage',
      'git discard',
      'git remote-file-url',
      'git remote-commit-url'
    ],
    load: async () => (await import('./handlers/workspace-git.js')).WORKSPACE_GIT_HANDLERS
  }
]
