import { expect, it } from 'vitest'
import { SidebarViewerParams } from './sidebar-viewer-params'

it('accepts only explicit sidebar and panel operations in the host viewer', () => {
  expect(
    SidebarViewerParams.parse({ viewer: 'host', operation: 'toggle', side: 'left' })
  ).toMatchObject({ side: 'left' })
  expect(
    SidebarViewerParams.parse({ viewer: 'host', operation: 'open-panel', panel: 'search' })
  ).toMatchObject({ panel: 'search' })
  for (const command of [
    { viewer: 'other', operation: 'get' },
    { viewer: 'host', operation: 'open-panel', panel: 'plugin:unreviewed' },
    { viewer: 'host', operation: 'toggle', side: 'left', script: 'eval' },
    { viewer: 'host', operation: 'open-panel', panel: 'search', query: 'implicit search' }
  ]) {
    expect(SidebarViewerParams.safeParse(command).success).toBe(false)
  }
})
