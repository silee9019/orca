// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applySetupGuideSidebarHideRequest } from './setup-guide-sidebar-hide-command'
import { publishSettingsViewerView } from './settings-viewer-view'

const fixture = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  return {
    state: {
      settings,
      persistedUIReady: true,
      workspaceSessionReady: true,
      activeModal: 'none',
      modalData: {},
      sidebarOpen: true,
      activeView: 'worktree',
      activeWorktreeId: 'w',
      setupGuideSidebarDismissed: false
    },
    listeners: new Set<() => void>()
  }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => fixture.state,
    subscribe: (fn: () => void) => {
      fixture.listeners.add(fn)
      return () => fixture.listeners.delete(fn)
    }
  }
}))
let app: HTMLElement
let root: HTMLElement
let nav: HTMLElement
let trigger: HTMLButtonElement
let menu: HTMLElement | null
let ready = true
const opens = vi.fn<() => void>()
const selects = vi.fn<() => void>()
const notify = () => fixture.listeners.forEach((fn) => fn())
const request = () => ({
  id: 'r',
  expiresAt: Date.now() + 9000,
  command: { viewer: 'host' as const, operation: 'hide-sidebar-entry' as const }
})
const apply = () => applySetupGuideSidebarHideRequest(request(), () => ready)
function openMenu(parent: HTMLElement = document.body): void {
  menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.dataset.state = 'open'
  menu.dataset.setupGuideSidebarMenuOwner = 'owner'
  trigger.dataset.state = 'open'
  menu.innerHTML = '<div role="menuitem" data-setup-guide-sidebar-hide="true">Hide</div>'
  menu.querySelector('[role="menuitem"]')?.addEventListener('click', selects)
  parent.append(menu)
}
beforeEach(() => {
  vi.useFakeTimers()
  ready = true
  menu = null
  Object.assign(fixture.state, {
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    workspaceSessionReady: true,
    activeModal: 'none',
    modalData: {},
    sidebarOpen: true,
    activeView: 'worktree',
    activeWorktreeId: 'w',
    setupGuideSidebarDismissed: false
  })
  publishSettingsViewerView(null)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 100)
  )
  root = document.createElement('div')
  root.dataset.viewerSidebar = 'left'
  nav = document.createElement('div')
  nav.dataset.contextualTourTarget = 'sidebar-navigation'
  trigger = document.createElement('button')
  trigger.dataset.contextualTourTarget = 'setup-guide-entry'
  trigger.dataset.setupGuideSidebarOwner = 'owner'
  nav.append(trigger)
  root.append(nav)
  app = document.createElement('div')
  app.append(root)
  document.body.append(app)
  opens.mockReset()
  opens.mockImplementation(() => openMenu())
  trigger.addEventListener('contextmenu', opens)
  selects.mockReset()
  selects.mockImplementation(() => {
    fixture.state.setupGuideSidebarDismissed = true
    notify()
    trigger.remove()
    menu?.remove()
  })
})
afterEach(() => {
  document.body.replaceChildren()
  fixture.listeners.clear()
  publishSettingsViewerView(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('opens the original context menu once and selects its exact item once', async () => {
  expect(await apply()).toMatchObject({
    applied: true,
    source: 'sidebar',
    sidebarDismissed: true,
    sidebarEntryPresent: false,
    menuPresent: false,
    writeOutcome: 'unverified',
    diskPersistence: 'unverified'
  })
  expect(opens).toHaveBeenCalledTimes(1)
  expect(selects).toHaveBeenCalledTimes(1)
  expect(fixture.listeners.size).toBe(0)
})
it.each([
  'dismissed',
  'closed',
  'missing',
  'hidden',
  'remote',
  'root',
  'foreign',
  'duplicate',
  'stale'
])('rejects initial %s without opening a menu', async (kind) => {
  if (kind === 'dismissed') {
    fixture.state.setupGuideSidebarDismissed = true
  }
  if (kind === 'closed') {
    fixture.state.sidebarOpen = false
  }
  if (kind === 'missing') {
    trigger.remove()
  }
  if (kind === 'hidden') {
    root.hidden = true
  }
  if (kind === 'remote') {
    fixture.state.settings.activeRuntimeEnvironmentId = 'ssh'
  }
  if (kind === 'root') {
    ready = false
  }
  if (kind === 'foreign') {
    const d = document.createElement('div')
    d.setAttribute('role', 'alertdialog')
    document.body.append(d)
  }
  if (kind === 'duplicate') {
    root.append(trigger.cloneNode(true))
  }
  if (kind === 'stale') {
    openMenu()
  }
  await expect(apply()).rejects.toThrow()
  expect(opens).not.toHaveBeenCalled()
  expect(selects).not.toHaveBeenCalled()
})
it.each(['owner', 'disabled', 'duplicate', 'foreign', 'missing'])(
  'does not select an unavailable %s menu item',
  async (kind) => {
    opens.mockImplementation(() => {
      openMenu()
      if (kind === 'owner' && menu) {
        menu.dataset.setupGuideSidebarMenuOwner = 'other'
      }
      if (kind === 'disabled') {
        menu?.firstElementChild?.setAttribute('aria-disabled', 'true')
      }
      if (kind === 'duplicate' && menu?.firstElementChild) {
        menu.append(menu.firstElementChild.cloneNode(true))
      }
      if (kind === 'foreign') {
        const d = document.createElement('div')
        d.setAttribute('role', 'dialog')
        document.body.append(d)
      }
      if (kind === 'missing') {
        menu?.replaceChildren()
      }
    })
    const result = apply()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toMatchObject({ applied: false })
    expect(selects).not.toHaveBeenCalled()
  }
)
it.each(['root', 'runtime', 'workspace', 'dismissal', 'entry-reinsert', 'menu-reinsert'])(
  'refuses %s leave-return during selection',
  async (kind) => {
    selects.mockImplementation(() => {
      fixture.state.setupGuideSidebarDismissed = true
      notify()
      trigger.remove()
      menu?.remove()
      if (kind === 'root') {
        root.remove()
        document.body.append(root)
      }
      if (kind === 'runtime') {
        fixture.state.settings.activeRuntimeEnvironmentId = 'ssh'
        notify()
        fixture.state.settings.activeRuntimeEnvironmentId = null
      }
      if (kind === 'workspace') {
        fixture.state.activeWorktreeId = 'other'
        notify()
        fixture.state.activeWorktreeId = 'w'
      }
      if (kind === 'dismissal') {
        fixture.state.setupGuideSidebarDismissed = false
        notify()
        fixture.state.setupGuideSidebarDismissed = true
      }
      if (kind === 'entry-reinsert') {
        root.append(trigger)
      }
      if (kind === 'menu-reinsert' && menu) {
        document.body.append(menu)
        menu.remove()
      }
    })
    const result = apply()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  }
)
it('does not acknowledge a menu that remains open after the original selection', async () => {
  selects.mockImplementation(() => {
    fixture.state.setupGuideSidebarDismissed = true
    notify()
    trigger.remove()
  })
  const result = apply()
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false, menuPresent: true })
})
it.each([
  'app-aria-hidden',
  'app-inert',
  'app-hidden',
  'body-style',
  'body-class',
  'html-class',
  'nav-class',
  'nav-style',
  'trigger-style'
])('refuses %s leave-return during selection', async (kind) => {
  selects.mockImplementation(() => {
    fixture.state.setupGuideSidebarDismissed = true
    notify()
    trigger.remove()
    menu?.remove()
    if (kind === 'app-aria-hidden') {
      app.setAttribute('aria-hidden', 'true')
      app.removeAttribute('aria-hidden')
    }
    if (kind === 'app-inert') {
      app.setAttribute('inert', '')
      app.removeAttribute('inert')
    }
    if (kind === 'app-hidden') {
      app.hidden = true
      app.hidden = false
    }
    if (kind === 'body-style') {
      document.body.style.pointerEvents = 'none'
      document.body.style.pointerEvents = ''
    }
    if (kind === 'body-class') {
      document.body.classList.add('x')
      document.body.classList.remove('x')
    }
    if (kind === 'html-class') {
      document.documentElement.classList.add('x')
      document.documentElement.classList.remove('x')
    }
    if (kind === 'nav-class') {
      nav.classList.add('x')
      nav.classList.remove('x')
    }
    if (kind === 'nav-style') {
      nav.style.display = 'none'
      nav.style.display = ''
    }
    if (kind === 'trigger-style') {
      trigger.style.opacity = '0'
      trigger.style.opacity = ''
    }
  })
  const result = apply()
  await vi.advanceTimersByTimeAsync(5000)
  expect(await result).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it.each(['body', 'wrapper', 'duplicate-open', 'before-removal'])(
  'refuses a transient same-owner %s menu',
  async (kind) => {
    const extra = (): HTMLElement => {
      const node = document.createElement('div')
      node.dataset.setupGuideSidebarMenuOwner = 'owner'
      return node
    }
    if (kind === 'duplicate-open') {
      opens.mockImplementation(() => {
        openMenu()
        const second = extra()
        document.body.append(second)
        second.remove()
      })
    } else {
      selects.mockImplementation(() => {
        fixture.state.setupGuideSidebarDismissed = true
        notify()
        const node = extra()
        const holder = document.createElement('div')
        if (kind === 'before-removal') {
          document.body.append(node)
          node.remove()
        }
        trigger.remove()
        menu?.remove()
        if (kind === 'wrapper') {
          holder.append(node)
          document.body.append(holder)
          holder.remove()
        }
        if (kind === 'body') {
          document.body.append(node)
          node.remove()
        }
      })
    }
    const result = apply()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toMatchObject({ applied: false })
  }
)
it('keeps a normal open menu positioning change from superseding the request', async () => {
  selects.mockImplementation(() => {
    menu?.style.setProperty('transform', 'translate(1px, 2px)')
    menu?.classList.add('animate-out')
    menu?.setAttribute('data-side', 'bottom')
    fixture.state.setupGuideSidebarDismissed = true
    notify()
    trigger.remove()
    menu?.remove()
  })
  expect(await apply()).toMatchObject({ applied: true })
})
it('accepts a Radix-shaped wrapper around the owner menu', async () => {
  opens.mockImplementation(() => {
    const wrapper = document.createElement('div')
    document.body.append(wrapper)
    openMenu(wrapper)
  })
  expect(await apply()).toMatchObject({ applied: true })
})
it('keeps unrelated ancestor attributes from superseding the request', async () => {
  selects.mockImplementation(() => {
    app.setAttribute('aria-current', 'page')
    app.dataset.state = 'busy'
    fixture.state.setupGuideSidebarDismissed = true
    notify()
    trigger.remove()
    menu?.remove()
  })
  expect(await apply()).toMatchObject({ applied: true })
})
