// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { hydrateDrivers, setDriverForPty } from '@/lib/pane-manager/mobile-driver-state'
import { hydrateOverrides, setFitOverride } from '@/lib/pane-manager/mobile-fit-overrides'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applyMobileDriverViewerRequest } from '@/runtime/mobile-driver-viewer'
import { TerminalPaneMobileDriverPortals } from './TerminalPaneRuntimePortals'
import { useTerminalPaneMobileActions } from './use-terminal-pane-mobile-actions'
import type { TerminalPaneContextController } from './use-terminal-pane-context-actions'
import { restoreTerminalFitToDesktop, restoreTerminalFitsToDesktop } from './terminal-fit-restore'

vi.mock('./terminal-fit-restore', () => ({
  restoreTerminalFitToDesktop: vi.fn(),
  restoreTerminalFitsToDesktop: vi.fn()
}))
vi.mock('@/lib/pane-manager/pane-manager-registry', () => ({
  refitAndRefreshAllTerminalPanes: vi.fn()
}))
const focus = vi.fn()
function mobile() {
  setDriverForPty('pty-a', { kind: 'mobile', clientId: 'private-phone' })
  setFitOverride('pty-a', 'mobile-fit', 40, 20)
}
function restored() {
  setDriverForPty('pty-a', { kind: 'idle' })
  setFitOverride('pty-a', 'desktop-fit', 80, 24)
  return true
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  hydrateDrivers([])
  hydrateOverrides([])
  mobile()
  vi.mocked(restoreTerminalFitToDesktop).mockImplementation(async () => restored())
  vi.mocked(restoreTerminalFitsToDesktop).mockImplementation(async () => restored())
})
afterEach(() => {
  cleanup()
  hydrateDrivers([])
  hydrateOverrides([])
  vi.clearAllTimers()
  vi.useRealTimers()
})
it.each([false, true])(
  'routes actual portal native and typed restoration through the existing hook: all=%s',
  async (all) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: portal and restore hook read only this pane identity, container, leaf and terminal focus.
    const pane = {
      id: 1,
      leafId: 'leaf-a',
      container,
      terminal: { focus }
    } as unknown as ManagedPane
    let ptyId = 'pty-a'
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this fixture invokes only restore callbacks; unrelated context-action controller fields are never read.
    const context = {
      cwd: '/fixture',
      managerRef: { current: null },
      paneCwdRef: { current: new Map() },
      paneTransportsRef: { current: new Map([[1, { getPtyId: () => ptyId }]]) },
      refreshMobileOverlays: vi.fn(),
      setTerminalError: vi.fn(),
      settingsRef: { current: undefined },
      tabId: 'tab-a',
      worktreeId: 'folder-workspace'
    } as unknown as TerminalPaneContextController
    const hook = renderHook(() => useTerminalPaneMobileActions(context))
    const portal = render(
      <TooltipProvider>
        <TerminalPaneMobileDriverPortals
          controller={{
            chatLeafId: null,
            effectiveChatViewMode: false,
            managedPanes: [pane],
            paneTransportsRef: context.paneTransportsRef,
            restorePaneTerminalFit: hook.result.current.restorePaneTerminalFit,
            restoreAllTerminalFits: hook.result.current.restoreAllTerminalFits
          }}
        />
      </TooltipProvider>
    )
    try {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: all ? 'Take back all' : /^Take back$/ }))
      })
      const provider = all ? restoreTerminalFitsToDesktop : restoreTerminalFitToDesktop
      expect(provider).toHaveBeenCalledExactlyOnceWith(all ? ['pty-a'] : 'pty-a', undefined)
      expect(focus).toHaveBeenCalledOnce()
      mobile()
      let result: Awaited<ReturnType<typeof applyMobileDriverViewerRequest>> | undefined
      await act(async () => {
        result = await applyMobileDriverViewerRequest({
          id: 'portal',
          expiresAt: Date.now() + 1000,
          command: {
            viewerId: 7,
            operation: all ? 'mobile-driver.restore-all' : 'mobile-driver.restore',
            ptyId: 'pty-a',
            confirmTarget: all ? 'all-mobile-terminals' : 'pty-a'
          }
        })
      })
      expect(result).toMatchObject({ applied: true, state: { remainingCount: 0 } })
      expect(provider).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(result)).not.toContain('private-phone')
      if (!all) {
        mobile()
        ptyId = 'replacement-pty'
        await act(async () => {
          result = await applyMobileDriverViewerRequest({
            id: 'stale',
            expiresAt: Date.now() + 1000,
            command: {
              viewerId: 7,
              operation: 'mobile-driver.restore',
              ptyId: 'pty-a',
              confirmTarget: 'pty-a'
            }
          })
        })
        expect(result?.applied).toBe(false)
        expect(provider).toHaveBeenCalledTimes(2)
      }
    } finally {
      portal.unmount()
      hook.unmount()
      container.remove()
    }
  }
)
