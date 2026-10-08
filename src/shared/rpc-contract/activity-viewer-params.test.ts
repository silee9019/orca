import { expect, it } from 'vitest'
import { ActivityViewerParams } from './activity-viewer-params'
it('requires an explicit host and activity surface with existing preference domains', () => {
  for (const surface of ['sidebar-agents', 'activity-page']) {
    for (const command of [
      { operation: 'get' },
      { operation: 'mark-all-read' },
      { operation: 'clear-completed' },
      { operation: 'clear-thread', paneKey: 'tab:one' },
      { operation: 'clear-threads', paneKeys: ['tab:one', 'tab:two'] },
      { operation: 'read-toggle', paneKey: 'tab:leaf' },
      { operation: 'read-toggle-many', paneKeys: ['tab:one', 'tab:two'] },
      { operation: 'group', by: 'project' },
      { operation: 'read', filter: 'unread' },
      { operation: 'compact', enabled: false },
      { operation: 'children', enabled: true }
    ]) {
      expect(ActivityViewerParams.safeParse({ viewer: 'host', surface, ...command }).success).toBe(
        true
      )
    }
  }
  for (const command of [
    { viewer: 'host', operation: 'get' },
    { viewer: 'host', surface: 'unknown', operation: 'get' },
    { viewer: 'peer', surface: 'sidebar-agents', operation: 'get' },
    { viewer: 'host', surface: 'activity-page', operation: 'group', by: 'repo' },
    { viewer: 'host', surface: 'activity-page', operation: 'compact', enabled: 'true' }
  ]) {
    expect(ActivityViewerParams.safeParse(command).success).toBe(false)
  }
})

it('keeps Activity scope origins and targets explicit and closed', () => {
  const target = { viewer: 'host', surface: 'activity-page' }
  for (const command of [
    { operation: 'origin', kind: 'cli', hidden: true },
    { operation: 'origin', kind: 'automation', hidden: false },
    { operation: 'origin', kind: 'other-client', hidden: true },
    { operation: 'scope-reset' },
    { operation: 'host-toggle', host: 'ssh:fixture' },
    { operation: 'hosts-toggle-all' }
  ]) {
    expect(ActivityViewerParams.safeParse({ ...target, ...command }).success).toBe(true)
  }
  for (const command of [
    { operation: 'origin', kind: 'unknown', hidden: true },
    { operation: 'origin', kind: 'cli', hidden: 'true' },
    { operation: 'host-toggle', host: '' },
    { operation: 'scope-reset', repo: 'unexpected' },
    { operation: 'clear-completed', paneKey: 'unexpected' },
    { operation: 'clear-thread', paneKey: '' },
    { operation: 'clear-threads', paneKeys: ['one'] },
    { operation: 'clear-threads', paneKeys: ['one', 'one'] },
    { operation: 'read-toggle', paneKey: '' },
    { operation: 'read-toggle-many', paneKeys: ['one'] },
    { operation: 'read-toggle-many', paneKeys: ['one', 'one'] }
  ]) {
    expect(ActivityViewerParams.safeParse({ ...target, ...command }).success).toBe(false)
  }
})

it('accepts an explicit Activity workspace jump and rejects empty targets', () => {
  expect(
    ActivityViewerParams.safeParse({
      viewer: 'host',
      surface: 'activity-page',
      operation: 'jump',
      paneKey: 'tab:leaf'
    }).success
  ).toBe(true)
  expect(
    ActivityViewerParams.safeParse({
      viewer: 'host',
      surface: 'activity-page',
      operation: 'jump',
      paneKey: ''
    }).success
  ).toBe(false)
})

it('requires an explicit target for select and rejects unsupported modifiers', () => {
  const target = {
    viewer: 'host',
    surface: 'activity-page',
    operation: 'select',
    paneKey: 'tab:leaf'
  }
  expect(ActivityViewerParams.parse(target)).toEqual(target)
  expect(ActivityViewerParams.safeParse({ ...target, paneKey: '' }).success).toBe(false)
  expect(ActivityViewerParams.safeParse({ ...target, ctrlKey: true }).success).toBe(false)
})
