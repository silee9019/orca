// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import type { TabDragItemData } from '../tab-group/useTabDragSplit'
import { i18n } from '@/i18n/i18n'
import TabBarItemRow from './TabBarItemRow'
import type { TabBarItem } from './tab-bar-item-model'
import { useTabBarItemActions } from './use-tab-bar-item-actions'

const drag = vi.hoisted(() => {
  const descriptors: { id: string; data: TabDragItemData }[] = []
  return { descriptors, begin: vi.fn() }
})
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: (descriptor: { id: string; data: TabDragItemData }) => {
    drag.descriptors.push(descriptor)
    return { attributes: {}, listeners: { onPointerDown: drag.begin }, setNodeRef: () => {} }
  }
}))

const originalLanguage = i18n.language

const callbacks = {
  activate: vi.fn(),
  close: vi.fn(),
  closeOthers: vi.fn(),
  closeRight: vi.fn(),
  closeLeft: vi.fn(),
  pin: vi.fn()
}
const item: TabBarItem = {
  type: 'browser',
  id: 'browser:spread',
  unifiedTabId: 'unified:spread',
  isPinned: false,
  data: {
    id: 'browser:spread',
    worktreeId: 'folder:spread',
    url: 'https://fixture.invalid/row',
    title: 'Spread row',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 0
  }
}

function Fixture({ pinned = false, right = true, left = true, count = 3 } = {}) {
  const actions = useTabBarItemActions({
    props: {
      onActivate: callbacks.activate,
      onActivateBrowserTab: callbacks.activate,
      onClose: callbacks.close,
      onCloseBrowserTab: callbacks.close,
      onCloseOthers: callbacks.closeOthers,
      onCloseToRight: callbacks.closeRight,
      onCloseToLeft: callbacks.closeLeft,
      onSetCustomTitle: () => {},
      onSetTabColor: () => {},
      onTogglePaneExpand: () => {}
    },
    togglePinned: callbacks.pin,
    toggleTabViewMode: () => {}
  })
  return (
    <TooltipProvider>
      <TabBarItemRow
        item={{ ...item, isPinned: pinned }}
        actions={actions}
        worktreeId="folder:spread"
        groupId="group:spread"
        generatedTabTitlesEnabled={false}
        tabCount={count}
        hasTabsToLeft={left}
        hasTabsToRight={right}
        isActive
        isExpanded={false}
        dropIndicator="right"
        includeTopTabBorder={false}
        canToggleViewMode={false}
        isChatView={false}
        viewModeTabId={undefined}
        canDuplicate={false}
        gitStatus={null}
      />
    </TooltipProvider>
  )
}
function row(): HTMLElement {
  const element = document.querySelector('[data-tab-id="browser:spread"]')
  if (!(element instanceof HTMLElement)) {
    throw new Error('BrowserTab row did not mount')
  }
  return element
}
function openMenu(): void {
  fireEvent.contextMenu(row(), { clientX: 25, clientY: 30 })
}

describe('actual TabBarItemRow BrowserTab spread receivers', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    Object.values(callbacks).forEach((callback) => callback.mockClear())
    drag.descriptors.length = 0
    drag.begin.mockClear()
  })
  afterEach(cleanup)
  afterAll(async () => {
    await i18n.changeLanguage(originalLanguage)
  })

  it.each([
    ['Close Others', 'closeOthers'],
    ['Close Tabs To The Right', 'closeRight'],
    ['Close Tabs To The Left', 'closeLeft']
  ] as const)('forwards %s through its distinct closeScope callback', (label, key) => {
    render(<Fixture />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: label }))
    expect(callbacks[key]).toHaveBeenCalledExactlyOnceWith(item.id)
    for (const [other, callback] of Object.entries(callbacks)) {
      if (other !== key) {
        expect(callback).not.toHaveBeenCalled()
      }
    }
  })

  it('forwards shared metadata and drag descriptor while pinning remains separate from activation', () => {
    render(<Fixture />)
    expect(row().dataset.active).toBe('true')
    expect(row().dataset.pinned).toBe('false')
    expect(row().classList.contains('border-t')).toBe(false)
    expect(row().className).toContain('after:')
    expect(drag.descriptors.at(-1)).toEqual({
      id: item.id,
      data: {
        kind: 'tab',
        worktreeId: 'folder:spread',
        groupId: 'group:spread',
        unifiedTabId: item.unifiedTabId,
        visibleTabId: item.id,
        tabType: 'browser',
        label: item.data.title,
        iconPath: undefined,
        color: null
      }
    })
    fireEvent.pointerDown(row(), { button: 0, clientX: 10, clientY: 10 })
    expect(drag.begin).toHaveBeenCalledTimes(1)
    fireEvent.pointerCancel(window)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin Tab' }))
    expect(callbacks.pin).toHaveBeenCalledExactlyOnceWith(item)
    expect(callbacks.activate).not.toHaveBeenCalled()
    expect(callbacks.closeOthers).not.toHaveBeenCalled()
  })

  it('uses shared pinned and scope metadata to disable unavailable menu actions', () => {
    render(<Fixture pinned right={false} left={false} count={1} />)
    expect(row().dataset.pinned).toBe('true')
    expect(row().querySelector('button')).toBeNull()
    openMenu()
    for (const label of [
      'Close',
      'Close Others',
      'Close Tabs To The Right',
      'Close Tabs To The Left'
    ]) {
      const entry = screen.getByRole('menuitem', { name: label })
      expect(entry.getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(entry)
    }
    expect(callbacks.close).not.toHaveBeenCalled()
    expect(callbacks.closeOthers).not.toHaveBeenCalled()
    expect(callbacks.closeRight).not.toHaveBeenCalled()
    expect(callbacks.closeLeft).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unpin Tab' }))
    expect(callbacks.pin).toHaveBeenCalledExactlyOnceWith({ ...item, isPinned: true })
  })
})
