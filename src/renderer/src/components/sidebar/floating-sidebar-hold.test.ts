// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  FLOATING_SIDEBAR_TITLEBAR_INSET_PX,
  hasOpenFloatingSidebarPopup,
  isFloatingSidebarHeld,
  isPanelFocusHolding,
  resolveFloatingSidebarTopInset
} from './floating-sidebar-hold'
import {
  INITIAL_FLOATING_SIDEBAR_REVEAL,
  stepFloatingSidebarReveal
} from './floating-sidebar-reveal'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('hasOpenFloatingSidebarPopup', () => {
  it('ignores the always-mounted worktree list listbox', () => {
    document.body.innerHTML = '<div role="listbox" tabindex="0" data-worktree-sidebar></div>'
    expect(hasOpenFloatingSidebarPopup(document)).toBe(false)
  })

  it('holds for an open menu', () => {
    document.body.innerHTML = '<div role="menu" data-state="open"></div>'
    expect(hasOpenFloatingSidebarPopup(document)).toBe(true)
  })

  it('holds for an open Select listbox but not a closed one', () => {
    document.body.innerHTML = '<div role="listbox" data-state="closed"></div>'
    expect(hasOpenFloatingSidebarPopup(document)).toBe(false)
    document.body.innerHTML = '<div role="listbox" data-state="open"></div>'
    expect(hasOpenFloatingSidebarPopup(document)).toBe(true)
  })
})

describe('isFloatingSidebarHeld', () => {
  const idle = { pointerDown: false, panelHasFocus: false, hasOpenPopup: false, hasModal: false }

  it('is not held when idle', () => {
    expect(isFloatingSidebarHeld(idle)).toBe(false)
  })

  it.each(['pointerDown', 'panelHasFocus', 'hasOpenPopup', 'hasModal'] as const)(
    'is held by %s',
    (key) => {
      expect(isFloatingSidebarHeld({ ...idle, [key]: true })).toBe(true)
    }
  )
})

describe('close with a project list mounted', () => {
  it('closes after pointer leave when only the static listbox exists', () => {
    document.body.innerHTML = '<div role="listbox" tabindex="0" data-worktree-sidebar></div>'
    const held = isFloatingSidebarHeld({
      pointerDown: false,
      panelHasFocus: false,
      hasOpenPopup: hasOpenFloatingSidebarPopup(document),
      hasModal: false
    })
    let state = stepFloatingSidebarReveal(INITIAL_FLOATING_SIDEBAR_REVEAL, {
      type: 'pointer-enter'
    }).state
    state = stepFloatingSidebarReveal(state, { type: 'hold-changed', held }).state
    const leave = stepFloatingSidebarReveal(state, { type: 'pointer-leave' })
    expect(leave.timer).toBe('start')
    expect(stepFloatingSidebarReveal(leave.state, { type: 'timer-elapsed' }).state.revealed).toBe(
      false
    )
  })
})

describe('resolveFloatingSidebarTopInset', () => {
  it('clears the floating titlebar only when it is mounted and floating', () => {
    expect(resolveFloatingSidebarTopInset({ shouldMount: true, isFloating: true })).toBe(
      FLOATING_SIDEBAR_TITLEBAR_INSET_PX
    )
    expect(resolveFloatingSidebarTopInset({ shouldMount: true, isFloating: false })).toBe(0)
    expect(resolveFloatingSidebarTopInset({ shouldMount: false, isFloating: false })).toBe(0)
  })
})

describe('isPanelFocusHolding', () => {
  it('holds for a focused text input inside the panel', () => {
    document.body.innerHTML = '<div id="p"><input id="i" /></div>'
    const panel = document.getElementById('p')
    document.querySelector<HTMLInputElement>('#i')?.focus()
    expect(isPanelFocusHolding(panel, document.activeElement)).toBe(true)
  })

  it('ignores focus outside the panel', () => {
    document.body.innerHTML = '<div id="p"></div><input id="o" />'
    document.querySelector<HTMLInputElement>('#o')?.focus()
    expect(isPanelFocusHolding(document.getElementById('p'), document.activeElement)).toBe(false)
  })
})
