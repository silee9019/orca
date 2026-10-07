import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'vitest'
import { classifyActionSources } from './cli-action-classification.mjs'
import {
  assessActionCoverage,
  collectActionSources,
  REQUIRED_SCOPES
} from './cli-action-coverage.mjs'

test('current sources have one classification and valid single bundle ownership', () => {
  const root = resolve(import.meta.dirname, '..', '..')
  const sources = collectActionSources(root)
  const ledger = JSON.parse(readFileSync(join(root, 'config/cli-action-coverage.json'), 'utf8'))
  const result = classifyActionSources(sources, ledger)
  assert.deepEqual(assessActionCoverage(sources, result).errors, [])
  assert.ok(assessActionCoverage(sources, result, true).errors.length > 0)
  for (const scope of result.scopes) {
    const file = scope.fixture.split(':')[0]
    assert.ok(readFileSync(join(root, file), 'utf8').includes("test('dynamic contributions"))
  }
})

test('sample corrections retain domain and operation distinctions', () => {
  const input = [
    ['command:tab profile clone', 'src/cli/specs/browser-basic.ts', '{ path: [] }', 'tools'],
    [
      'api:browser.sessionClearDefaultCookies',
      'src/preload/api/browser-api.ts',
      'browser.sessionClearDefaultCookies',
      'tools'
    ],
    [
      'control:github-submit',
      'src/renderer/src/components/github-item-dialog/discuss-item/gh-comment-composer.tsx',
      'Composer onSubmit={handleSubmit}',
      'workspace-data'
    ],
    [
      'control:new-workspace-name',
      'src/renderer/src/components/new-workspace/Name.tsx',
      'Input onChange={setName}',
      'workspace-data'
    ],
    [
      'shortcut:editor.save',
      'src/shared/keybindings/definitions-core-3.ts',
      "{id:'editor.save'}",
      'workspace-data'
    ],
    [
      'event:focus',
      'src/main/browser/browser-guest-shortcut-dispatch.ts',
      'ui:focusEditorTab',
      'viewer-ui'
    ],
    [
      'menu:quit',
      'src/main/menu/register-app-menu.ts',
      "{role:'quit', label: translateMain('menu.exit')}",
      'app-lifecycle'
    ]
  ]
  const ledger = { actions: [], bundles: [], scopes: [] }
  const sources = input.map(([id, file, detail]) => ({
    id,
    file,
    detail,
    fingerprint: id,
    component: 'Sample'
  }))
  const result = classifyActionSources(sources, ledger)
  for (const [id, , , bundle] of input) {
    const action = result.actions.find((item) => item.sources.some((source) => source.id === id))
    assert.equal(action?.bundle, bundle, id)
  }
  const consent = ['allow', 'keep-disabled'].map((decision) => ({
    id: `control:${decision}`,
    file: 'src/renderer/src/components/settings/PluginConsentDialog.tsx',
    detail: `Button onClick={() => decide('${decision}')}`,
    component: 'PluginConsentDialog',
    fingerprint: decision,
    callOperations: [`decide:${decision}`]
  }))
  const decisions = classifyActionSources(consent, ledger)
  assert.equal(decisions.actions.length, 2)
})

test('dynamic contributions, generated menus, OS/flags and forwarded JSX retain classified effects', () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-cli-classification-'))
  const write = (file, body) => {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), body)
  }
  try {
    execFileSync('git', ['init', '--quiet', root])
    write(
      'src/preload/api-types.ts',
      'export type PreloadApi = { plugins: { invokeCommand: (id: string) => void; onChanged: (fn: () => void) => void } }'
    )
    write(
      'src/shared/global-settings-types.ts',
      'export type GlobalSettings = { _migrationMarker: boolean; theme: string }'
    )
    write(
      'src/shared/plugins/plugin-manifest.ts',
      `
      const commandContributionSchema = { id: 'command-id', title: 'Old command', context: 'worktree' }
      const panelContributionSchema = { id: 'panel-id', entry: 'panel.html' }
    `
    )
    write(
      'src/renderer/src/components/plugins/RepresentativePanel.tsx',
      `
      function RepresentativePanel({ forwarded }) {
        return <Panel {...forwarded}><Button onClick={() => commands.save()} /><Button onClick={() => commands.reset()} /></Panel>
      }
    `
    )
    write(
      'src/main/menu/representative.ts',
      `
      const repos = [{ id: 'native' }, { id: 'ssh' }]
      const generated = repos.map(repo => ({ label: repo.id, click: () => selectRepo(repo.id) }))
      const platform = isMac ? { role: 'togglefullscreen' } : { click: () => toggleFullscreen() }
      const featureFlag = enabled ? { action: 'view.tasks' } : { action: 'view.workspaces' }
    `
    )
    const sources = collectActionSources(root)
    const ledger = {
      actions: [],
      bundles: [],
      scopes: REQUIRED_SCOPES.map((id) => ({
        id,
        status: 'classified',
        boundary: 'representative source',
        fixture: 'cli-action-classification.test.mjs'
      }))
    }
    const result = classifyActionSources(sources, ledger)
    assert.deepEqual(assessActionCoverage(sources, result).errors, [])
    assert.equal(
      result.actions.filter((action) => action.id.endsWith('.control.commands.save')).length,
      1
    )
    assert.equal(
      result.actions.filter((action) => action.id.endsWith('.control.commands.reset')).length,
      1
    )
    assert.ok(result.actions.some((action) => action.id.includes('menu.selectRepo')))
    assert.ok(result.actions.some((action) => action.id.includes('menu.togglefullscreen')))
    assert.ok(result.actions.some((action) => action.id.includes('menu.toggleFullscreen')))
    assert.ok(result.actions.some((action) => action.id.includes('menu.view.tasks')))
    assert.ok(result.actions.some((action) => action.id.includes('menu.view.workspaces')))
    for (const kind of ['registration', 'event', 'control-spread']) {
      for (const action of result.actions.filter(
        (item) => item.rule === kind && item.sources.length
      )) {
        assert.equal(action.support, 'internal')
        assert.ok(result.actions.some((parent) => parent.id === action.parent))
      }
    }
    assert.ok(
      assessActionCoverage(sources, result, true).errors.some((error) =>
        error.startsWith('Incomplete action:')
      )
    )
    const replay = classifyActionSources(sources, ledger)
    assert.deepEqual(replay, result)
    const shifted = sources.map((source) => ({ ...source, line: source.line + 100 }))
    assert.deepEqual(classifyActionSources(shifted, ledger), result)
    assert.throws(
      () => classifyActionSources([{ id: 'unknown:x', file: 'src/x.ts', detail: '' }], ledger),
      /Unknown source kind/
    )
    const newSources = [...sources, { ...sources[0], id: 'api:plugins.newCommand' }]
    assert.ok(
      assessActionCoverage(newSources, result).errors.some((error) =>
        error.startsWith('Unclassified sources:')
      )
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
