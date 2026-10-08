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
