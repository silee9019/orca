import { act } from 'react'
import { expect, vi } from 'vitest'
import { requestPluginMarketplace } from '../../src/renderer/src/runtime/plugin-marketplace-request'
import type { PluginMarketplaceViewerState } from '../../src/shared/rpc-contract/plugin-marketplace-viewer-params'

let sourceFailure = false
let installedFailure = false
let holdSource = false
let releaseSource = (): void => {}
let sourceStarted = false
export function fixtureMarketplaceRefreshApi(
  providerCalls: string[],
  holdSourceDialog: (release: () => void) => void
) {
  return {
    refresh: vi.fn(async () => {
      if (installedFailure) {
        throw new Error('fixture installed refresh refused')
      }
      return []
    }),
    refreshMarketplaces: async (target?: { sourceId?: string }) => {
      providerCalls.push('source-refresh')
      if (target?.sourceId) {
        await new Promise<void>((resolve) => holdSourceDialog(resolve))
        return
      }
      sourceStarted = true
      if (holdSource) {
        await new Promise<void>((resolve) => {
          releaseSource = resolve
        })
      }
      if (sourceFailure) {
        throw new Error('fixture source refresh refused')
      }
    }
  }
}
export async function verifyMarketplaceRefresh(
  invoke: (action: string, value?: string) => Promise<void>,
  container: HTMLElement,
  notifyInstalled: () => void
): Promise<void> {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await invoke('refresh')
    expect(window.api.plugins.refresh).toHaveBeenCalledOnce()
    sourceFailure = true
    await expect(invoke('refresh')).rejects.toThrow(
      'plugin_marketplace_refresh_failed_effect_unknown'
    )
    expect(container.textContent).toContain('Could not refresh marketplaces.')
    sourceFailure = false
    installedFailure = true
    await expect(invoke('refresh')).rejects.toThrow(
      'plugin_marketplace_refresh_failed_effect_unknown'
    )
    installedFailure = false
    await invoke('refresh')
    await invoke('filter', 'installed')
    expect(container.textContent).not.toContain('Could not load plugins.')
    await invoke('filter', 'all')
    holdSource = true
    sourceStarted = false
    const overlapped = invoke('refresh')
    void overlapped.catch(() => {})
    await vi.waitFor(() => expect(sourceStarted).toBe(true))
    await act(async () => {
      notifyInstalled()
    })
    await act(async () => releaseSource())
    await expect(overlapped).rejects.toThrow('plugin_marketplace_refresh_failed_effect_unknown')
    const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Refresh'
    )
    expect(refreshButton).toBeDefined()
    const previousRefreshCalls = vi.mocked(window.api.plugins.refresh).mock.calls.length
    let sameTurn: Promise<PluginMarketplaceViewerState> | undefined
    await act(async () => {
      refreshButton?.click()
      sameTurn = requestPluginMarketplace({ action: 'refresh' }, Date.now() + 3000)
      void sameTurn.catch(() => {})
    })
    await expect(sameTurn).rejects.toThrow('plugin_marketplace_refresh_busy')
    expect(window.api.plugins.refresh).toHaveBeenCalledTimes(previousRefreshCalls + 1)
    await act(async () => releaseSource())
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(refreshButton?.disabled).toBe(false)
    })
  } finally {
    sourceFailure = false
    installedFailure = false
    holdSource = false
    releaseSource()
    warn.mockRestore()
  }
}
