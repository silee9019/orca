// @vitest-environment happy-dom
import { DndContext } from '@dnd-kit/core'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import { TabDragProvider } from '../tab-group/tab-drag-context'
import BrowserTab from './BrowserTab'
import ClientHostedBrowserTab from './ClientHostedBrowserTab'

const activate = vi.fn()
const close = vi.fn()
function tree(active: boolean, dragging: boolean) {
  return (
    <TooltipProvider>
      <TabDragProvider isTabDragActive={dragging} isTabDragActiveRef={{ current: dragging }}>
        <DndContext>
          <BrowserTab
            tab={{
              id: 'page',
              worktreeId: 'work',
              url: 'about:blank',
              title: 'Fixture',
              loading: false,
              faviconUrl: null,
              canGoBack: false,
              canGoForward: false,
              loadError: null,
              createdAt: 0
            }}
            isActive={active}
            isPinned={false}
            hasTabsToLeft={false}
            hasTabsToRight={false}
            tabCount={1}
            onActivate={activate}
            onClose={close}
            onCloseOthers={() => {}}
            onCloseToLeft={() => {}}
            onCloseToRight={() => {}}
            onTogglePin={() => {}}
            dragData={{
              kind: 'tab',
              worktreeId: 'work',
              groupId: 'group',
              unifiedTabId: 'browser:page',
              visibleTabId: 'page',
              tabType: 'browser',
              label: 'Fixture'
            }}
          />
          <ClientHostedBrowserTab
            row={{
              browserPageId: 'client-page',
              worktreeId: 'work',
              url: 'about:blank',
              title: 'Client fixture',
              loading: false,
              browserHostClientId: 'client',
              hostDeviceName: 'Fixture',
              hostAbsent: false
            }}
            isActive={active}
            hasTabsToRight={false}
            onActivate={activate}
            onClose={close}
          />
        </DndContext>
      </TabDragProvider>
    </TooltipProvider>
  )
}
afterEach(() => {
  cleanup()
  activate.mockClear()
  close.mockClear()
})
it('projects actual sortable accessibility attributes and both slot dock metadata without firing actions', () => {
  const view = render(tree(true, false))
  const page = document.querySelector('[data-tab-id="page"]')
  expect(page?.getAttribute('role')).toBe('button')
  expect(page?.getAttribute('tabindex')).toBe('0')
  expect(page?.getAttribute('aria-roledescription')).toBe('sortable')
  expect(page?.getAttribute('aria-disabled')).toBe('false')
  for (const id of ['page', 'client-page']) {
    const slot = document.querySelector(`[data-tab-strip-slot="${id}"]`)
    expect(slot?.hasAttribute('data-active-tab-dock')).toBe(true)
    expect(slot?.className).toContain('sticky')
  }
  view.rerender(tree(true, true))
  for (const id of ['page', 'client-page']) {
    const slot = document.querySelector(`[data-tab-strip-slot="${id}"]`)
    expect(slot?.hasAttribute('data-active-tab-dock')).toBe(false)
    expect(slot?.className).not.toContain('sticky')
  }
  view.rerender(tree(false, false))
  expect(document.querySelectorAll('[data-active-tab-dock]')).toHaveLength(0)
  expect(activate).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
})
