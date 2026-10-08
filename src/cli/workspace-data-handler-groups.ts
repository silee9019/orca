import { WORKSPACE_REPO_PICKER_HANDLER_GROUPS } from './workspace-repo-picker-handler-groups'
import { WORKSPACE_CLEANUP_HANDLER_GROUPS } from './workspace-cleanup-handler-groups'
import type { HandlerGroup } from './handler-group-manifest'
import { WORKSPACE_PROVIDER_HANDLER_GROUPS } from './workspace-provider-handler-groups'

export const WORKSPACE_DATA_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-repo-add',
    keys: ['repo add-desktop-local', 'repo add-desktop-remote'],
    load: async () => (await import('./handlers/workspace-repo-add.js')).WORKSPACE_REPO_ADD_HANDLERS
  },
  {
    name: 'workspace-repo-create-remote',
    keys: ['repo create-desktop-remote'],
    load: async () =>
      (await import('./handlers/workspace-repo-create-remote.js'))
        .WORKSPACE_REPO_CREATE_REMOTE_HANDLERS
  },
  ...WORKSPACE_CLEANUP_HANDLER_GROUPS,
  ...WORKSPACE_REPO_PICKER_HANDLER_GROUPS,
  {
    name: 'workspace-diagnostic-preview',
    keys: ['diagnostics open-retained-preview'],
    load: async () =>
      (await import('./handlers/workspace-diagnostic-preview.js'))
        .WORKSPACE_DIAGNOSTIC_PREVIEW_HANDLERS
  },
  {
    name: 'workspace-notebook-environments',
    keys: [
      'notebook environments',
      'notebook describe-python',
      'notebook create-venv',
      'notebook install-ipykernel'
    ],
    load: async () =>
      (await import('./handlers/workspace-notebook-environments.js'))
        .WORKSPACE_NOTEBOOK_ENVIRONMENT_HANDLERS
  },
  {
    name: 'workspace-shell-actions',
    keys: [
      'shell reveal',
      'shell open-editor',
      'shell open-file',
      'shell open-file-uri',
      'shell copy-document-file'
    ],
    load: async () =>
      (await import('./handlers/workspace-shell-actions.js')).WORKSPACE_SHELL_ACTION_HANDLERS
  },
  {
    name: 'workspace-import-previews',
    keys: ['settings preview-ghostty-import', 'settings preview-warp-auto'],
    load: async () =>
      (await import('./handlers/workspace-import-previews.js')).WORKSPACE_IMPORT_PREVIEW_HANDLERS
  },
  {
    name: 'workspace-repo-update',
    keys: ['repo update-desktop'],
    load: async () =>
      (await import('./handlers/workspace-repo-update.js')).WORKSPACE_REPO_UPDATE_HANDLERS
  },
  {
    name: 'workspace-repo-username',
    keys: ['repo git-username-for-host'],
    load: async () =>
      (await import('./handlers/workspace-repo-username.js')).WORKSPACE_REPO_USERNAME_HANDLERS
  },
  {
    name: 'workspace-desktop-meta',
    keys: ['worktree update-desktop-meta'],
    load: async () =>
      (await import('./handlers/workspace-desktop-meta.js')).WORKSPACE_DESKTOP_META_HANDLERS
  },
  {
    name: 'workspace-visible-worktrees',
    keys: ['worktree list-visible', 'worktree list-all-visible'],
    load: async () =>
      (await import('./handlers/workspace-visible-worktrees.js'))
        .WORKSPACE_VISIBLE_WORKTREE_HANDLERS
  },
  {
    name: 'workspace-host-path',
    keys: ['file mkdir-host-path', 'file host-path-exists'],
    load: async () =>
      (await import('./handlers/workspace-host-path.js')).WORKSPACE_HOST_PATH_HANDLERS
  },
  {
    name: 'workspace-crash-reports',
    keys: [
      'crash-report latest-pending',
      'crash-report latest',
      'crash-report dismiss',
      'crash-report copy-diagnostics',
      'crash-report submit'
    ],
    load: async () =>
      (await import('./handlers/workspace-crash-reports.js')).WORKSPACE_CRASH_REPORT_HANDLERS
  },
  {
    name: 'workspace-git-startup',
    keys: ['git await-environment'],
    load: async () =>
      (await import('./handlers/workspace-git-startup.js')).WORKSPACE_GIT_STARTUP_HANDLERS
  },
  {
    name: 'workspace-cached-scans',
    keys: ['workspace-cleanup cached-scan', 'workspace-space cached-analysis'],
    load: async () =>
      (await import('./handlers/workspace-cached-scans.js')).WORKSPACE_CACHED_SCAN_HANDLERS
  },
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
    keys: [
      'keybindings mac-captured-digit-row',
      'keybindings ensure-file',
      'keybindings open-file',
      'keybindings reveal-file'
    ],
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
      'repo search-base-refs',
      'repo sparse-presets',
      'repo save-sparse-preset',
      'repo create',
      'repo git-available',
      'repo clone',
      'repo rm',
      'repo reorder',
      'repo default-project-parent',
      'repo remove-for-host',
      'repo reorder-for-host',
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
