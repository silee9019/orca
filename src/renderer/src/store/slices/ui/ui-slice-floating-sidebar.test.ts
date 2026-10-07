import { describe, expect, it } from 'vitest'
import { resolveToggleSidebarPatch } from './floating-sidebar-toggle'

describe('resolveToggleSidebarPatch', () => {
  it('flips the pinned sidebarOpen value when floating is off', () => {
    expect(
      resolveToggleSidebarPatch({ sidebarOpen: true, floating: false, revealed: false })
    ).toEqual({
      sidebarOpen: false
    })
  })

  it('flips only the transient reveal when floating is on, leaving sidebarOpen untouched', () => {
    const patch = resolveToggleSidebarPatch({ sidebarOpen: true, floating: true, revealed: false })
    expect(patch).toEqual({ floatingSidebarRevealed: true })
    expect('sidebarOpen' in patch).toBe(false)
  })

  it('never writes sidebarOpen across a floating on/off cycle', () => {
    let sidebarOpen = false
    let revealed = false
    for (const floating of [true, true, false, true]) {
      const patch = resolveToggleSidebarPatch({ sidebarOpen, floating, revealed })
      if ('sidebarOpen' in patch) {
        expect(floating).toBe(false)
        sidebarOpen = patch.sidebarOpen
      } else {
        revealed = patch.floatingSidebarRevealed
      }
    }
    expect(sidebarOpen).toBe(true)
  })
})
