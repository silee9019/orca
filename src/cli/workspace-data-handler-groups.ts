import type { HandlerGroup } from './handler-group-manifest'
import { WORKSPACE_PROVIDER_HANDLER_GROUPS } from './workspace-provider-handler-groups'

export const WORKSPACE_DATA_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-github-account',
    keys: [
      'github viewer',
      'github diagnose-auth',
      'github check-orca-starred',
      'github star-orca'
    ],
    load: async () =>
      (await import('./handlers/workspace-github-account.js')).WORKSPACE_GITHUB_ACCOUNT_HANDLERS
  },
  {
    name: 'workspace-gitlab-inspection',
    keys: [
      'gitlab viewer',
      'gitlab issue',
      'gitlab mr',
      'gitlab mr-for-branch',
      'gitlab project-slug',
      'gitlab list-assignable-users'
    ],
    load: async () =>
      (await import('./handlers/workspace-gitlab-inspection.js'))
        .WORKSPACE_GITLAB_INSPECTION_HANDLERS
  },
  {
    name: 'workspace-keybinding-file',
    keys: ['keybindings ensure-file', 'keybindings open-file', 'keybindings reveal-file'],
    load: async () =>
      (await import('./handlers/workspace-keybinding-file.js')).WORKSPACE_KEYBINDING_FILE_HANDLERS
  },
  {
    name: 'workspace-git-ignore',
    keys: ['git ignore-candidates', 'git ignore-folder'],
    load: async () =>
      (await import('./handlers/workspace-git-ignore.js')).WORKSPACE_GIT_IGNORE_HANDLERS
  },
  {
    name: 'workspace-git-generation',
    keys: [
      'git generate-commit-message',
      'git discover-commit-models',
      'git cancel-commit-message',
      'git generate-review-fields',
      'git cancel-review-fields'
    ],
    load: async () =>
      (await import('./handlers/workspace-git-generation.js')).WORKSPACE_GIT_GENERATION_HANDLERS
  },
  ...WORKSPACE_PROVIDER_HANDLER_GROUPS,
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
  },
  {
    name: 'workspace-folder',
    keys: [
      'folder-workspace create',
      'folder-workspace update',
      'folder-workspace delete',
      'folder-workspace path-status',
      'folder-workspace list'
    ],
    load: async () => (await import('./handlers/workspace-folder.js')).WORKSPACE_FOLDER_HANDLERS
  },
  {
    name: 'workspace-project-group',
    keys: [
      'project-group list',
      'project-group create',
      'project-group update',
      'project-group delete',
      'project-group move-project',
      'project-group scan-nested',
      'project-group import-nested'
    ],
    load: async () =>
      (await import('./handlers/workspace-project-group.js')).WORKSPACE_PROJECT_GROUP_HANDLERS
  },
  {
    name: 'workspace-repo-data',
    keys: [
      'repo sparse-presets',
      'repo save-sparse-preset',
      'repo create',
      'repo git-available',
      'repo clone',
      'repo rm',
      'repo reorder',
      'repo base-ref-default'
    ],
    load: async () =>
      (await import('./handlers/workspace-repo-data.js')).WORKSPACE_REPO_DATA_HANDLERS
  },
  {
    name: 'workspace-project-data',
    keys: ['project update'],
    load: async () =>
      (await import('./handlers/workspace-project-data.js')).WORKSPACE_PROJECT_DATA_HANDLERS
  },
  {
    name: 'workspace-ports',
    keys: ['workspace-ports scan', 'workspace-ports kill'],
    load: async () => (await import('./handlers/workspace-ports.js')).WORKSPACE_PORTS_HANDLERS
  },
  {
    name: 'workspace-catalog',
    keys: [
      'worktree detected',
      'worktree retired-names',
      'worktree lineage',
      'worktree reorder',
      'worktree resolve-pr-base',
      'worktree resolve-mr-base',
      'worktree prefetch-base',
      'worktree delete-preserved-branch'
    ],
    load: async () => (await import('./handlers/workspace-catalog.js')).WORKSPACE_CATALOG_HANDLERS
  }
]
