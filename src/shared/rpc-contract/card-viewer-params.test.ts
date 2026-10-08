import { expect, it } from 'vitest'
import { CardViewerParams } from './card-viewer-params'

it('requires a host viewer and validates each card operation', () => {
  expect(
    CardViewerParams.parse({ viewer: 'host', operation: 'mode', mode: 'Compact' })
  ).toMatchObject({ mode: 'Compact' })
  expect(CardViewerParams.safeParse({ viewer: 'peer', operation: 'get' }).success).toBe(false)
  expect(
    CardViewerParams.safeParse({ viewer: 'host', operation: 'mode', mode: 'dense' }).success
  ).toBe(false)
  expect(
    CardViewerParams.safeParse({
      viewer: 'host',
      operation: 'activity',
      mode: 'full',
      properties: []
    }).success
  ).toBe(false)
})
