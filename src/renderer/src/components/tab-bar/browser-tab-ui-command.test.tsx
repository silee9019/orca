// @vitest-environment happy-dom
import {
  fixture,
  Owner,
  command,
  target,
  resetBrowserTabUiFixture
} from './browser-tab-ui-command-test-fixture'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyBrowserViewerRequest } from '@/runtime/browser-viewer-bridge'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'
import { requestBrowserTabUi } from '@/runtime/browser-tab-ui-request'
import {
  getClientHostedBrowserRowSelection,
  selectClientHostedBrowserRow
} from '@/lib/pane-manager/client-hosted-browser-row-state'
beforeEach(resetBrowserTabUiFixture)
afterEach(cleanup)
it('activates the original workspace/group owner and clears hosted-row selection', async () => {
  selectClientHostedBrowserRow({
    worktreeId: 'folder',
    browserPageId: 'hosted',
    groupId: 'group',
    groupActiveTabIdAtSelection: 'left'
  })
  render(<Owner />)
  expect(await command('activate')).toMatchObject({
    activeGroup: 'group',
    activeTab: 'target',
    activeWorkspace: 'ws-target',
    activeType: 'browser',
    guestRegistrationVerified: false
  })
  expect(getClientHostedBrowserRowSelection()).toBeNull()
  expect(fixture.activate).toHaveBeenCalledWith('target')
})
it('toggles the same row pin callback and refuses pinned close', async () => {
  render(<Owner />)
  expect(await command('toggle-pin')).toMatchObject({ pinned: true })
  await expect(command('close')).rejects.toThrow('browser_tab_ui_pinned')
  expect(fixture.close).not.toHaveBeenCalled()
  expect(await command('toggle-pin')).toMatchObject({ pinned: false })
  expect(await command('close')).toMatchObject({ exists: false, closedTabs: ['target'] })
})
it.each(['close-left', 'close-right', 'close-others'] as const)(
  'uses original dirty-aware %s scope preserving pinned tabs',
  async (action) => {
    render(<Owner />)
    const expected =
      action === 'close-left' ? ['left'] : action === 'close-right' ? ['right'] : ['left', 'right']
    expect(await command(action)).toMatchObject({ closedTabs: expected, exists: true })
    expect(fixture.close).toHaveBeenCalledWith(expected)
    expect(fixture.state.unifiedTabsByWorktree.folder.some((tab) => tab.id === 'pinned')).toBe(true)
  }
)
it('reports a dirty-close refusal as unknown instead of successful closure', async () => {
  fixture.blocked.add('right')
  render(<Owner />)
  await expect(command('close-others')).rejects.toThrow('browser_tab_ui_not_applied_effect_unknown')
  expect(fixture.closed).toEqual(['left'])
  expect(fixture.state.unifiedTabsByWorktree.folder.some((tab) => tab.id === 'right')).toBe(true)
})
it('uses original local duplication options and observes profile/partition/group placement', async () => {
  render(<Owner />)
  expect(await command('duplicate')).toMatchObject({
    duplicatedWorkspace: 'ws-copy',
    tabOrder: ['left', 'target', 'copy', 'pinned', 'right'],
    guestRegistrationVerified: false
  })
  expect(fixture.create).toHaveBeenCalledWith('folder', 'https://example.test/', {
    title: 'Example',
    sessionProfileId: 'profile',
    sessionPartition: 'partition',
    afterTabId: 'target'
  })
})
it('rejects foreign host, stale group and expired requests before mutation', async () => {
  const row = fixture.state.unifiedTabsByWorktree.folder[1]
  row.executionHostId = 'ssh:remote'
  render(<Owner />)
  await expect(command('activate')).rejects.toThrow('browser_tab_ui_host_mismatch')
  delete row.executionHostId
  row.groupId = 'moved'
  await expect(command('activate')).rejects.toThrow('browser_tab_ui_target_mismatch')
  await expect(requestBrowserTabUi(target, 'activate', Date.now() - 1)).rejects.toThrow(
    'request_expired'
  )
  expect(fixture.activate).not.toHaveBeenCalled()
})

it('routes workspace targets before the inner-page lookup and keeps rendering unverified', async () => {
  render(<Owner />)
  let response: ReturnType<typeof applyBrowserViewerRequest> | undefined
  await act(async () => {
    response = applyBrowserViewerRequest({
      id: 'tab-ui',
      expiresAt: Date.now() + 5000,
      command: { viewer: 'host', operation: 'tab-ui', target, action: 'activate' }
    })
    void response.catch(() => {})
  })
  await expect(response).resolves.toMatchObject({
    applied: true,
    rendered: false,
    persisted: false,
    tabUi: { activeTab: 'target', activeWorkspace: 'ws-target' }
  })
})

it('opens and closes the original context menu at an explicit client point after React commit', async () => {
  const closeAll = vi.fn()
  window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeAll)
  try {
    render(<Owner />)
    expect(await command('menu-open', { x: 25, y: 30 })).toMatchObject({
      menu: { open: true, point: { x: 25, y: 30 } }
    })
    expect(closeAll).toHaveBeenCalledOnce()
    await command('menu-open', { x: 25, y: 30 })
    expect(closeAll).toHaveBeenCalledTimes(2)
    expect(await command('status')).toMatchObject({ menu: { open: true } })
    expect(await command('menu-close')).toMatchObject({ menu: { open: false } })
    await command('menu-open', { x: 30, y: 35 })
    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(await command('status')).toMatchObject({ menu: { open: false } })
    await expect(command('menu-open')).rejects.toThrow('browser_tab_menu_point_required')
    await expect(command('menu-open', { x: -1, y: 10 })).rejects.toThrow(
      'browser_tab_menu_point_required'
    )
  } finally {
    window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeAll)
  }
})

it('shares the context-menu owner with the actual row pointer capture handler', async () => {
  const view = render(<Owner />)
  const row = view.container.querySelector('[data-tab-id="ws-target"]')
  if (!row) {
    throw new Error('missing actual BrowserTab row')
  }
  expect(fireEvent.contextMenu(row, { clientX: 40, clientY: 60 })).toBe(false)
  expect(await command('status')).toMatchObject({ menu: { open: true, point: { x: 40, y: 60 } } })
  expect(await command('menu-close')).toMatchObject({ menu: { open: false } })
})
