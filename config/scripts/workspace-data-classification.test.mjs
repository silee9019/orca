import assert from 'node:assert/strict'
import { test } from 'vitest'
import { classifyActionSources } from './cli-action-classification.mjs'

test('workspace command declarations keep workspace ownership without moving existing provider or app actions', () => {
  const input = [
    ['folder-workspace create', 'workspace-folder', 'workspace-data'],
    ['workspace-ports kill', 'workspace-ports', 'workspace-data'],
    ['repo sparse-presets', 'workspace-repo-data', 'workspace-data'],
    ['workspace-space cached-analysis', 'workspace-cached-scans', 'workspace-data'],
    ['workspace-cleanup dismiss', 'workspace-cleanup-dismissals', 'workspace-data'],
    ['worktree list-visible', 'workspace-visible-worktrees', 'workspace-data'],
    ['worktree update-desktop-meta', 'workspace-desktop-meta', 'workspace-data'],
    ['repo git-username-for-host', 'workspace-repo-username', 'workspace-data'],
    ['repo update-desktop', 'workspace-repo-update', 'workspace-data'],
    ['repo icon-picker-start', 'workspace-repo-icon-picker', 'workspace-data'],
    ['diagnostics open-retained-preview', 'workspace-diagnostic-preview', 'workspace-data'],
    ['notebook environments', 'workspace-notebook-environments', 'workspace-data'],
    ['repo create-desktop-remote', 'workspace-repo-create-remote', 'workspace-data'],
    ['repo add-desktop-local', 'workspace-repo-add', 'workspace-data'],
    ['repo folder-picker-start', 'workspace-repo-folder-picker', 'workspace-data'],
    ['worktree forget-desktop', 'workspace-worktree-forget', 'workspace-data'],
    ['workspace-cleanup scan-start', 'workspace-cleanup-scan', 'workspace-data'],
    ['shell reveal', 'workspace-shell-actions', 'workspace-data'],
    ['settings preview-ghostty-import', 'workspace-import-previews', 'workspace-data'],
    ['file host-path-exists', 'workspace-host-path', 'workspace-data'],
    ['crash-report latest', 'workspace-crash-reports', 'workspace-data'],
    ['git await-environment', 'workspace-git-startup', 'workspace-data'],
    ['repo sparse-presets', 'repo', 'extensions'],
    ['app status', 'core', 'app-lifecycle']
  ]
  for (const [command, file, bundle] of input) {
    const id = `command:${command}`
    const result = classifyActionSources(
      [
        {
          id,
          file: `src/cli/specs/${file}.ts`,
          detail: command,
          fingerprint: id,
          component: 'CommandSpec'
        }
      ],
      { actions: [], bundles: [] }
    )
    assert.equal(result.actions[0].bundle, bundle, `${file}: ${command}`)
  }
})
