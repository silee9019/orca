import { expect, it } from 'vitest'
import { StatusBarViewerParams } from './status-bar-viewer-params'

it('requires an explicit viewer and rejects implicit or unknown status bar values', () => {
  expect(
    StatusBarViewerParams.parse({
      viewer: 'host',
      operation: 'item',
      item: 'ports',
      enabled: false
    })
  ).toMatchObject({ enabled: false })
  for (const command of [
    { operation: 'get' },
    { viewer: 'remote', operation: 'toggle' },
    { viewer: 'host', operation: 'item', item: 'ports', enabled: 'false' },
    { viewer: 'host', operation: 'item', item: 'unknown', enabled: true },
    { viewer: 'host', operation: 'percentage', display: 'total' },
    { viewer: 'host', operation: 'get', extra: true }
  ]) {
    expect(StatusBarViewerParams.safeParse(command).success).toBe(false)
  }
})
