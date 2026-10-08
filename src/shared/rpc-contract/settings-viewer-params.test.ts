import { expect, it } from 'vitest'
import { SettingsViewerParams } from './settings-viewer-params'

it('requires a selected viewer and refuses ambiguous or extra navigation inputs', () => {
  expect(SettingsViewerParams.safeParse({ operation: 'open', pane: 'general' }).success).toBe(false)
  expect(
    SettingsViewerParams.safeParse({ viewer: 'host', operation: 'open', pane: 'repo' }).success
  ).toBe(false)
  expect(
    SettingsViewerParams.safeParse({
      viewer: 'host',
      operation: 'open',
      pane: 'general',
      repoId: 'a'
    }).success
  ).toBe(false)
  expect(
    SettingsViewerParams.safeParse({
      viewer: 'host',
      operation: 'search',
      query: '',
      eval: 'window'
    }).success
  ).toBe(false)
  expect(
    SettingsViewerParams.safeParse({ viewer: 'host', operation: 'search', query: 'a'.repeat(2049) })
      .success
  ).toBe(false)
  expect(
    SettingsViewerParams.parse({
      viewer: 'host',
      operation: 'open',
      pane: 'repo',
      repoId: 'a',
      sectionId: 'hooks'
    })
  ).toMatchObject({ pane: 'repo', repoId: 'a' })
  expect(
    SettingsViewerParams.parse({ viewer: 'host', operation: 'search', query: '' })
  ).toMatchObject({ query: '' })
})
