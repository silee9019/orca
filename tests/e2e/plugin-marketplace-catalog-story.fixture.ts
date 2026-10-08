import { act } from 'react'
import { expect, vi } from 'vitest'
import { requestPluginMarketplace } from '../../src/renderer/src/runtime/plugin-marketplace-request'
import type { PluginMarketplaceViewerState } from '../../src/shared/rpc-contract/plugin-marketplace-viewer-params'
import type { PluginMarketplaceHostListing } from '../../src/preload/api-types'

let nextListings: (() => Promise<PluginMarketplaceHostListing[]>) | undefined
export async function readFixtureMarketplaceListings(
  fallback: PluginMarketplaceHostListing[]
): Promise<PluginMarketplaceHostListing[]> {
  return nextListings ? await nextListings() : [...fallback]
}
export async function verifyMarketplaceCatalogReload(
  invoke: (action: string, value?: string) => Promise<void>,
  container: HTMLElement
): Promise<void> {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    nextListings = async () => {
      throw new Error('fixture provider refused')
    }
    await expect(invoke('reload')).rejects.toThrow('plugin_marketplace_load_failed_effect_unknown')
    expect(container.textContent).toContain('Could not load marketplace plugins.')
    nextListings = async () => []
    const retryBeforeCommit = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Try again'
    )
    expect(retryBeforeCommit).toBeDefined()
    let beforeCommit: Promise<PluginMarketplaceViewerState> | undefined
    await act(async () => {
      beforeCommit = requestPluginMarketplace({ action: 'reload' }, Date.now() + 3000)
      void beforeCommit.catch(() => {})
      for (let turn = 0; turn < 20; turn++) {
        await Promise.resolve()
      }
      retryBeforeCommit?.click()
    })
    await expect(beforeCommit).rejects.toThrow('plugin_marketplace_load_failed_effect_unknown')
    nextListings = async () => {
      throw new Error('fixture provider refused')
    }
    await expect(invoke('reload')).rejects.toThrow('plugin_marketplace_load_failed_effect_unknown')
    const release: { first?: () => void } = {}
    let calls = 0
    nextListings = async () => {
      calls++
      if (calls === 1) {
        await new Promise<void>((resolve) => {
          release.first = resolve
        })
      }
      return []
    }
    const stale = invoke('reload')
    void stale.catch(() => {})
    await vi.waitFor(() => expect(calls).toBe(1))
    const retry = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Try again'
    )
    expect(retry).toBeDefined()
    await act(async () => retry?.click())
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(calls).toBe(2)
      expect(container.textContent).not.toContain('Could not load marketplace plugins.')
    })
    await act(async () => release.first?.())
    await expect(stale).rejects.toThrow('plugin_marketplace_load_failed_effect_unknown')
    expect(container.querySelectorAll('[data-marketplace-plugin-key]')).toHaveLength(0)
    nextListings = undefined
    await invoke('reload')
    expect(container.querySelectorAll('[data-marketplace-plugin-key]')).toHaveLength(2)
  } finally {
    nextListings = undefined
    warn.mockRestore()
  }
}
