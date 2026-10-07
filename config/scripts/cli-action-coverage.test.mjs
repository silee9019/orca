import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import {
  assessActionCoverage,
  collectActionSources,
  REQUIRED_SCOPES
} from './cli-action-coverage.mjs'

test('classification is independent from implementation and required execution evidence', () => {
  const sources = [{ id: 'api:ui.get', fingerprint: 'current' }]
  const ledger = {
    bundles: [{ id: 'viewer-ui' }],
    scopes: REQUIRED_SCOPES.map((id) => ({
      id,
      status: 'classified',
      boundary: 'fixture registration',
      fixture: 'representative action'
    })),
    actions: [
      {
        id: 'ui.project-filter.get',
        bundle: 'viewer-ui',
        phase: 2,
        effect: 'Read current project filter',
        owner: 'UI store',
        host: 'viewer runtime',
        viewer: 'explicit viewer',
        gap: 'No CLI or rendered acknowledgement',
        verification: 'read-back and actual filtered rows',
        support: 'gap',
        evidence: 'unverified',
        sources: [{ id: 'api:ui.get', fingerprint: 'current' }]
      }
    ]
  }
  const assess = (change = () => {}, final = false) => {
    const input = structuredClone(ledger)
    change(input)
    return assessActionCoverage(sources, input, final)
  }
  assert.deepEqual(assess().errors, [])
  assert.equal(assess().support.gap, 1)
  assert.equal(assess().evidence.unverified, 1)
  assert.ok(assess(() => {}, true).errors.some((error) => error.startsWith('Incomplete action:')))
  assert.equal(
    assess((input) => {
      input.actions = []
    }).unclassified.length,
    1
  )
  assert.ok(
    assess((input) => {
      input.actions[0].sources[0].fingerprint = 'old'
    }).errors.some((error) => error.startsWith('Changed source:'))
  )
  assert.ok(
    assess((input) => {
      input.actions.push(input.actions[0])
    }).errors.some((error) => error.startsWith('Duplicate or empty action:'))
  )
  assert.ok(
    assess((input) => {
      input.actions[0].bundle = ['viewer-ui', 'other']
    }).errors.some((error) => error.startsWith('Unknown bundle:'))
  )
  assert.ok(
    assess((input) => {
      input.actions[0].support = 'implemented'
    }).errors.some((error) => error.startsWith('Missing command:'))
  )
  assert.ok(
    assess((input) => {
      input.actions[0].evidence = 'verified'
    }).errors.some((error) => error.startsWith('Missing execution evidence:'))
  )
  assert.ok(
    assess((input) => {
      input.scopes = []
    }).errors.includes('Missing scope: plugin-panels')
  )
  const implemented = structuredClone(ledger)
  Object.assign(implemented.actions[0], {
    support: 'implemented',
    command: 'ui filter get',
    evidence: 'verified',
    evidencePaths: ['isolated-output.json']
  })
  implemented.actions[0].sources.push({ id: 'command:ui filter get', fingerprint: 'spec' })
  assert.deepEqual(
    assessActionCoverage(
      [...sources, { id: 'command:ui filter get', fingerprint: 'spec' }],
      implemented,
      true
    ).errors,
    []
  )
  assert.ok(
    assessActionCoverage(sources, implemented, true).errors.some((error) =>
      error.startsWith('Missing command:')
    )
  )
})

test('discovers new panes, nested types, anonymous callbacks and custom JSX events without running them', () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-cli-action-coverage-'))
  const write = (file, content) => {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  try {
    execFileSync('git', ['init', '--quiet', root])
    write(
      'src/preload/api-types.ts',
      'type Imported = { nested: { run: () => void } }; export type PreloadApi = Imported & { read: () => void }'
    )
    write(
      'src/shared/global-settings-types.ts',
      'export type GlobalSettings = { visible: boolean; nested: { enabled: boolean } }'
    )
    write(
      'src/renderer/settings-navigation-fixture.tsx',
      `
      const panes = [{ id: 'nested', searchEntries: [{ title: 'Nested' }] }]
      const view = <Button {...props} onClick={() => { throw new Error('must not execute') }} onRemoveProject={remove} />
    `
    )
    write(
      'src/shared/plugins/plugin-manifest.ts',
      'const commandContributionSchema = { id: "sample" }; const panelContributionSchema = { entry: "panel.html" }'
    )
    write(
      'src/cli/specs/fixture.ts',
      "export const specs = [{ path: ['ui', 'filter', 'get'], summary: 'read' }]"
    )
    const sources = collectActionSources(root)
    assert.ok(sources.some((source) => source.id === 'api:nested.run'))
    assert.ok(sources.some((source) => source.id === 'setting:nested'))
    assert.equal(sources.filter((source) => source.id.startsWith('pane:')).length, 1)
    assert.equal(sources.filter((source) => source.id.startsWith('control:')).length, 2)
    assert.equal(sources.filter((source) => source.id.startsWith('control-spread:')).length, 1)
    assert.equal(sources.filter((source) => source.id.startsWith('registration:')).length, 2)
    assert.ok(sources.some((source) => source.id === 'command:ui filter get'))
    const result = assessActionCoverage(sources, { bundles: [], actions: [], scopes: [] })
    assert.equal(result.unclassified.length, sources.length)
    assert.ok(result.errors.some((error) => error.startsWith('Unclassified sources:')))
    write(
      'src/preload/api-types.ts',
      "import { Missing } from './missing'; export type PreloadApi = Missing"
    )
    assert.throws(() => collectActionSources(root), /Unresolved action-type imports/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
