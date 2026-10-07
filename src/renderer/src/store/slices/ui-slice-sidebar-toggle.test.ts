import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { resolveSidebarPresentation } from '../../components/sidebar/sidebar-presentation'
import { createUIStore } from './ui-slice-test-harness'

function createStore(floatingSidebar: boolean, sidebarOpen: boolean) {
  const store = createUIStore()
  store.setState({
    settings: { ...getDefaultSettings('~'), floatingSidebar },
    sidebarOpen
  })
  return store
}

function presentation(store: ReturnType<typeof createStore>): string {
  const s = store.getState()
  return resolveSidebarPresentation({
    floatingSidebar: s.settings?.floatingSidebar === true,
    sidebarOpen: s.sidebarOpen
  })
}

describe('toggleSidebar (Cmd+B, menu, titlebar button)', () => {
  it.each([true, false])(
    'flips only the pinned sidebarOpen value when floating is %s',
    (floating) => {
      const store = createStore(floating, false)
      store.getState().toggleSidebar()
      expect(store.getState().sidebarOpen).toBe(true)
      store.getState().toggleSidebar()
      expect(store.getState().sidebarOpen).toBe(false)
      expect(store.getState().settings?.floatingSidebar).toBe(floating)
    }
  )

  it('pins a hidden floating sidebar into layout, then hides it back to hover-only', () => {
    const store = createStore(true, false)
    expect(presentation(store)).toBe('hover-overlay')
    store.getState().toggleSidebar()
    expect(presentation(store)).toBe('pinned')
    store.getState().toggleSidebar()
    expect(presentation(store)).toBe('hover-overlay')
  })

  it('hides a pinned floating sidebar, then pins it again', () => {
    const store = createStore(true, true)
    expect(presentation(store)).toBe('pinned')
    store.getState().toggleSidebar()
    expect(presentation(store)).toBe('hover-overlay')
    store.getState().toggleSidebar()
    expect(presentation(store)).toBe('pinned')
  })

  it('behaves like the non-floating sidebar when floating is off', () => {
    const store = createStore(false, true)
    expect(presentation(store)).toBe('pinned')
    store.getState().toggleSidebar()
    expect(presentation(store)).toBe('collapsed')
  })
})

describe('resolveSidebarPresentation', () => {
  it.each([
    [false, true, 'pinned'],
    [false, false, 'collapsed'],
    [true, true, 'pinned'],
    [true, false, 'hover-overlay']
  ] as const)('floating=%s sidebarOpen=%s -> %s', (floatingSidebar, sidebarOpen, expected) => {
    expect(resolveSidebarPresentation({ floatingSidebar, sidebarOpen })).toBe(expected)
  })
})
