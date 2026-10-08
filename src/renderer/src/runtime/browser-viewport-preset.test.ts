import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const page: { id: string; viewportPresetId: string | null } = {
    id: 'page-1',
    viewportPresetId: null
  }
  return {
    page,
    native: vi.fn(),
    state: {
      settings: {},
      persistedUIReady: true,
      browserPagesByWorkspace: { workspace: [page] },
      remoteBrowserPageHandlesByPageId: {},
      setBrowserPageViewportPreset: vi.fn((_id: string, preset: string | null) => {
        page.viewportPresetId = preset
      })
    }
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('@/store/slices/browser-page-records', () => ({ findPage: () => fixture.page }))
import { applyBrowserViewerRequest } from './browser-viewer-bridge'

beforeEach(() => {
  fixture.page.viewportPresetId = null
  vi.clearAllMocks()
  fixture.native.mockResolvedValue(true)
  vi.stubGlobal('window', { api: { browser: { setViewportOverride: fixture.native } } })
})

function apply(preset: 'tablet' | null) {
  return applyBrowserViewerRequest({
    id: 'viewport-fixture',
    expiresAt: Date.now() + 1000,
    command: { viewer: 'host', operation: 'viewport-preset', page: 'page-1', preset }
  })
}

it('applies canonical native metrics before storing the preset and clears both', async () => {
  expect(await apply('tablet')).toMatchObject({ applied: true, preset: 'tablet', rendered: false })
  expect(fixture.native).toHaveBeenCalledWith({
    browserPageId: 'page-1',
    override: { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true }
  })
  expect(await apply(null)).toMatchObject({ applied: true, preset: null })
  expect(fixture.native).toHaveBeenLastCalledWith({ browserPageId: 'page-1', override: null })
})

it('preserves the previous preset when native application rejects or fails', async () => {
  fixture.native.mockResolvedValue(false)
  expect(await apply('tablet')).toMatchObject({ applied: false, preset: null })
  expect(fixture.state.setBrowserPageViewportPreset).not.toHaveBeenCalled()
  fixture.native.mockRejectedValue(new Error('native viewport unavailable'))
  await expect(apply('tablet')).rejects.toThrow('native viewport unavailable')
  expect(fixture.state.setBrowserPageViewportPreset).not.toHaveBeenCalled()
})
