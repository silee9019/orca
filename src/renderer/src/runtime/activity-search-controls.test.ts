import { expect, it, vi } from 'vitest'
import {
  captureActivitySearchControl,
  publishActivitySearchControl
} from './activity-search-controls'
it('captures only one mounted surface callback and preserves cleanup ownership', () => {
  const control = { getInput: () => null, getQuery: () => '', setQuery: vi.fn() }
  expect(() => captureActivitySearchControl('activity-page')).toThrow(
    'activity_surface_unavailable'
  )
  const unmount = publishActivitySearchControl('activity-page', control)
  expect(captureActivitySearchControl('activity-page')).toBe(control)
  expect(() => captureActivitySearchControl('sidebar-agents')).toThrow(
    'activity_surface_unavailable'
  )
  const other = { ...control, setQuery: vi.fn() }
  const unmountOther = publishActivitySearchControl('activity-page', other)
  expect(() => captureActivitySearchControl('activity-page')).toThrow('activity_surface_ambiguous')
  unmount()
  expect(captureActivitySearchControl('activity-page')).toBe(other)
  unmountOther()
  expect(() => captureActivitySearchControl('activity-page')).toThrow(
    'activity_surface_unavailable'
  )
})
