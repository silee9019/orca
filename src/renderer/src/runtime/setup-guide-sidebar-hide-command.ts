import { SetupGuideParams } from '../../../shared/rpc-contract/setup-guide-params'
import type { SetupGuideRequest, SetupGuideResult } from '../../../shared/setup-guide-command'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { assertHelpModalOpenAvailable } from './help-modal-open-lease'
import { observeViewerDialogIdentity } from './viewer-dialog-identity'

export async function applySetupGuideSidebarHideRequest(
  request: SetupGuideRequest,
  rootAvailable: () => boolean
): Promise<Omit<SetupGuideResult, 'viewerId'>> {
  const command = SetupGuideParams.parse(request.command)
  if (command.operation !== 'hide-sidebar-entry') {
    throw new Error('invalid_setup_guide_operation')
  }
  const { initial, visible, overlays } = assertHelpModalOpenAvailable(
    request.expiresAt,
    rootAvailable
  )
  const unavailable = 'setup_guide_sidebar_entry_unavailable'
  const roots = [...document.querySelectorAll<HTMLElement>('[data-viewer-sidebar="left"]')]
  const root = roots.length === 1 ? roots[0] : null
  const nav = root?.querySelector<HTMLElement>('[data-contextual-tour-target="sidebar-navigation"]')
  const entries = [
    ...(root?.querySelectorAll<HTMLButtonElement>(
      'button[data-contextual-tour-target="setup-guide-entry"]'
    ) ?? [])
  ]
  const trigger = entries.length === 1 ? entries[0] : null
  const owner = trigger?.dataset.setupGuideSidebarOwner
  if (
    !initial.workspaceSessionReady ||
    !initial.sidebarOpen ||
    initial.setupGuideSidebarDismissed ||
    !root ||
    !nav ||
    !trigger ||
    !nav.contains(trigger) ||
    !owner ||
    trigger.disabled ||
    !visible(root) ||
    !visible(nav) ||
    !visible(trigger)
  ) {
    throw new Error(unavailable)
  }
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const initialView = initial.activeView
  const initialWorkspace = initial.activeWorktreeId
  if (
    [...document.querySelectorAll<HTMLElement>('[data-setup-guide-sidebar-menu-owner]')].some(
      (node) => node.dataset.setupGuideSidebarMenuOwner === owner
    )
  ) {
    throw new Error(unavailable)
  }
  const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
  let superseded = false
  let selected = false
  let reachedDismissed = false
  let ownedMenu: HTMLElement | null = null
  let menuRemoved = false
  const menus = (): HTMLElement[] =>
    [...document.querySelectorAll<HTMLElement>('[data-setup-guide-sidebar-menu-owner]')].filter(
      (node) => node.dataset.setupGuideSidebarMenuOwner === owner
    )
  const observe = (): void => {
    const state = useAppStore.getState()
    if (
      !rootAvailable() ||
      !state.settings ||
      !state.persistedUIReady ||
      !state.workspaceSessionReady ||
      getProviderRuntimeContextKey(state.settings) !== runtime ||
      !state.sidebarOpen ||
      state.activeView !== initialView ||
      state.activeWorktreeId !== initialWorkspace ||
      state.activeModal !== 'none' ||
      document.querySelectorAll('[data-viewer-sidebar="left"]').length !== 1 ||
      document.querySelector('[data-viewer-sidebar="left"]') !== root ||
      root.querySelectorAll('[data-contextual-tour-target="sidebar-navigation"]').length !== 1 ||
      root.querySelector('[data-contextual-tour-target="sidebar-navigation"]') !== nav ||
      !visible(root) ||
      !visible(nav)
    ) {
      superseded = true
    }
    const dismissed = state.setupGuideSidebarDismissed
    if ((!selected && dismissed) || (reachedDismissed && !dismissed)) {
      superseded = true
    }
    reachedDismissed ||= dismissed
    if (
      !selected &&
      (!trigger.isConnected ||
        !visible(trigger) ||
        trigger.dataset.setupGuideSidebarOwner !== owner)
    ) {
      superseded = true
    }
  }
  const rootObserver = observeViewerDialogIdentity(
    () => root,
    () => {
      superseded = true
    },
    ['data-viewer-sidebar', 'hidden', 'inert', 'aria-hidden', 'style', 'class']
  )
  const menuNodes = new Set<Node>()
  const isOwnedMenuNode = (node: Node): boolean =>
    [...menuNodes].some((menu) => node === menu || node.contains(menu))
  const inspectSourceRecords = (records: MutationRecord[]): void => {
    for (const record of records) {
      if (
        record.type === 'attributes' &&
        ((record.attributeName !== 'data-state' &&
          (record.target === trigger || record.target === nav || menuNodes.has(record.target))) ||
          (record.attributeName === 'data-state' && menuNodes.has(record.target) && !selected))
      ) {
        superseded = true
      }
      if (record.type !== 'childList') {
        continue
      }
      for (const removed of record.removedNodes) {
        const ownedMenuRemoved = isOwnedMenuNode(removed)
        menuRemoved ||= ownedMenuRemoved
        if (
          removed === nav ||
          removed.contains(nav) ||
          (!selected && (removed === trigger || removed.contains(trigger) || ownedMenuRemoved))
        ) {
          superseded = true
        }
      }
      for (const added of record.addedNodes) {
        if (!(added instanceof HTMLElement)) {
          continue
        }
        if (selected && (added === trigger || added.contains(trigger))) {
          superseded = true
        }
        for (const candidate of [
          added,
          ...added.querySelectorAll<HTMLElement>('[data-setup-guide-sidebar-menu-owner]')
        ]) {
          if (candidate.dataset.setupGuideSidebarMenuOwner !== owner) {
            continue
          }
          if (menuRemoved || (menuNodes.size > 0 && !menuNodes.has(candidate))) {
            superseded = true
          }
          menuNodes.add(candidate)
        }
      }
    }
  }
  const sourceObserver = new MutationObserver(inspectSourceRecords)
  const ancestorObserver = new MutationObserver(() => {
    superseded = true
  })
  for (let node: HTMLElement | null = trigger; node; node = node.parentElement) {
    ancestorObserver.observe(node, {
      attributes: true,
      attributeFilter: ['hidden', 'inert', 'aria-hidden', 'style', 'class']
    })
  }
  sourceObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'data-state',
      'data-setup-guide-sidebar-owner',
      'data-setup-guide-sidebar-menu-owner',
      'data-contextual-tour-target',
      'role',
      'hidden',
      'inert',
      'aria-hidden'
    ]
  })
  const unsubscribe = useAppStore.subscribe(observe)
  try {
    const bounds = trigger.getBoundingClientRect()
    const x = (Math.max(0, bounds.left) + Math.min(window.innerWidth, bounds.right)) / 2
    const y = (Math.max(0, bounds.top) + Math.min(window.innerHeight, bounds.bottom)) / 2
    trigger.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: x,
        clientY: y
      })
    )
    await Promise.resolve()
    let item: HTMLElement | null = null
    while (Date.now() < deadline && !superseded) {
      observe()
      const current = menus()
      if (current.length > 1 || (ownedMenu && current[0] !== ownedMenu)) {
        superseded = true
        break
      }
      if (current.length === 1) {
        ownedMenu = current[0]
        const items = [
          ...ownedMenu.querySelectorAll<HTMLElement>(
            '[role="menuitem"][data-setup-guide-sidebar-hide="true"]'
          )
        ]
        if (
          ownedMenu.getAttribute('role') === 'menu' &&
          ownedMenu.dataset.state === 'open' &&
          visible(ownedMenu) &&
          items.length === 1 &&
          !items[0].hasAttribute('data-disabled') &&
          items[0].getAttribute('aria-disabled') !== 'true' &&
          visible(items[0]) &&
          !overlays().some((node) => node !== ownedMenu && !ownedMenu?.contains(node))
        ) {
          item = items[0]
          break
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    observe()
    if (item && !superseded && Date.now() < deadline) {
      selected = true
      item.click()
      await Promise.resolve()
    }
    const removed = (): boolean =>
      !trigger.isConnected &&
      menus().length === 0 &&
      root.querySelector('[data-contextual-tour-target="setup-guide-entry"]') === null
    observe()
    while (selected && !superseded && (!removed() || !reachedDismissed) && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      observe()
    }
    observe()
    inspectSourceRecords(sourceObserver.takeRecords())
    superseded ||= ancestorObserver.takeRecords().length > 0
    const applied =
      selected && !superseded && Date.now() < deadline && reachedDismissed && removed()
    return {
      viewer: 'host',
      source: 'sidebar',
      applied,
      dialogPresent: false,
      contentPresent: false,
      stepId: null,
      sidebarDismissed: useAppStore.getState().setupGuideSidebarDismissed,
      sidebarEntryPresent:
        root.querySelector('[data-contextual-tour-target="setup-guide-entry"]') !== null,
      menuPresent: menus().length > 0,
      changed: applied,
      writeOutcome: 'unverified',
      diskPersistence: 'unverified',
      ...(!applied
        ? {
            reason: superseded
              ? ('viewer_surface_superseded' as const)
              : ('setup_guide_not_rendered' as const)
          }
        : {})
    }
  } finally {
    unsubscribe()
    sourceObserver.disconnect()
    ancestorObserver.disconnect()
    rootObserver.disconnect()
  }
}
