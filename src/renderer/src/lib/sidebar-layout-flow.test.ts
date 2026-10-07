import { describe, expect, it } from 'vitest'
import { isSidebarInLayoutFlow } from './sidebar-layout-flow'

describe('isSidebarInLayoutFlow', () => {
  it('follows the pinned value when floating is off', () => {
    expect(isSidebarInLayoutFlow({ sidebarOpen: true, settings: { floatingSidebar: false } })).toBe(
      true
    )
    expect(isSidebarInLayoutFlow({ sidebarOpen: false, settings: null })).toBe(false)
  })

  it('is never in flow when floating, even if the pinned value is open', () => {
    expect(isSidebarInLayoutFlow({ sidebarOpen: true, settings: { floatingSidebar: true } })).toBe(
      false
    )
  })
})
