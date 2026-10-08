// @vitest-environment happy-dom
import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AppState } from '@/store/types'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { requestBrowserProfileUi } from '@/runtime/browser-profile-ui-request'
import { BrowserToolbarMenu } from './BrowserToolbarMenu'
import type {
  BrowserProfileUiCommand,
  BrowserProfileUiState
} from '../../../../../shared/rpc-contract/browser-profile-ui-params'
const fixture = vi.hoisted(() => {
  let store: ReturnType<typeof createTestStore> | undefined
  return {
    getStore: () => {
      if (!store) {
        throw new Error('store missing')
      }
      return store
    },
    setStore: (value: ReturnType<typeof createTestStore>) => {
      store = value
    },
    detect: vi.fn(),
    browserImport: vi.fn(),
    fileImport: vi.fn(),
    profiles: [{ id: 'default', label: 'Default', partition: 'persist:default', scope: 'default' }]
  }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: AppState) => unknown) =>
      selector(useSyncExternalStore(fixture.getStore().subscribe, fixture.getStore().getState)),
    { getState: () => fixture.getStore().getState() }
  )
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: (...args: unknown[]) => fixture.fileImport(...args)
}))
vi.mock('./browser-toolbar-menu-dropdown', () => ({ BrowserToolbarMenuDropdown: () => null }))
vi.mock('./browser-toolbar-profile-dialogs', () => ({ BrowserToolbarProfileDialogs: () => null }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() }
}))
const summary = {
  totalCookies: 3,
  importedCookies: 2,
  skippedCookies: 1,
  domains: ['example.test']
}
const success = { ok: true, profileId: 'default', summary }
beforeEach(() => {
  vi.clearAllMocks()
  fixture.setStore(createTestStore())
  fixture.getStore().setState({
    browserSessionHostIdOverride: 'local',
    browserTabsByWorktree: {
      folder: [
        {
          id: 'workspace',
          worktreeId: 'folder',
          loading: false,
          faviconUrl: null,
          canGoBack: false,
          canGoForward: false,
          loadError: null,
          createdAt: 0,
          sessionProfileId: null,
          sessionPartition: 'persist:default',
          title: 'Browser',
          url: ''
        }
      ]
    }
  })
  fixture.detect.mockResolvedValue([
    {
      family: 'chrome',
      label: 'Chrome',
      selectedProfile: 'Default',
      profiles: [{ name: 'Default', directory: 'Default' }]
    }
  ])
  fixture.browserImport.mockResolvedValue(success)
  fixture.fileImport.mockResolvedValue(success)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      browser: {
        sessionDetectBrowsers: fixture.detect,
        sessionImportFromBrowser: fixture.browserImport,
        sessionListProfiles: vi.fn().mockResolvedValue(fixture.profiles)
      },
      ui: { set: vi.fn().mockResolvedValue(undefined) }
    }
  })
})
afterEach(cleanup)
function Owner({ active = true }: { active?: boolean }) {
  return (
    <BrowserToolbarMenu
      currentProfileId={null}
      workspaceId="workspace"
      browserPageId="page"
      viewportPresetId={null}
      onDestroyWebview={vi.fn()}
      isActive={active}
      overflow={{
        triggerRef: { current: null },
        tools: [],
        deferUntilClose: (action) => action(),
        onMenuCloseAutoFocus: vi.fn()
      }}
    />
  )
}
async function run(command: BrowserProfileUiCommand): Promise<BrowserProfileUiState> {
  let result: BrowserProfileUiState | undefined
  let error: unknown
  await act(async () => {
    await requestBrowserProfileUi('page', command, Date.now() + 5000).then(
      (value) => {
        result = value
      },
      (reason) => {
        error = reason
      }
    )
  })
  if (error) {
    throw error
  }
  if (!result) {
    throw new Error('no result')
  }
  return result
}
it('runs the actual toolbar import owner, provider and store status before acknowledgment', async () => {
  render(<Owner />)
  const result = await run({
    action: 'import-browser',
    family: 'chrome',
    browserProfile: 'Profile 1'
  })
  expect(fixture.browserImport).toHaveBeenCalledWith({
    profileId: 'default',
    browserFamily: 'chrome',
    browserProfile: 'Profile 1'
  })
  expect(fixture.getStore().getState().browserSessionImportState).toMatchObject({
    status: 'success',
    summary
  })
  expect(toast.success).toHaveBeenCalledTimes(1)
  expect(result.cookieImport).toEqual({
    profile: 'default',
    imported: 2,
    skipped: 1,
    total: 3,
    executionHost: 'local',
    executionMachine: 'client'
  })
})
it('reuses the existing explicit-file RPC and never opens a file picker', async () => {
  render(<Owner />)
  const filePath = join(tmpdir(), 'orca-cookies.json')
  await run({ action: 'import-file', filePath })
  expect(fixture.fileImport).toHaveBeenCalledWith({ kind: 'local' }, 'browser.profileImportFile', {
    profileId: 'default',
    filePath
  })
  expect(fixture.getStore().getState().browserSessionImportState?.status).toBe('success')
})
it('retains provider failure state and refuses a success acknowledgment', async () => {
  fixture.browserImport.mockResolvedValue({ ok: false, reason: 'keychain unavailable' })
  render(<Owner />)
  await expect(run({ action: 'import-browser', family: 'chrome' })).rejects.toThrow('import_failed')
  expect(toast.error).toHaveBeenCalledWith('keychain unavailable')
  expect(fixture.getStore().getState().browserSessionImportState).toMatchObject({
    status: 'error',
    error: 'keychain unavailable'
  })
})
it.each(['runtime:remote', 'ssh:remote'] as const)(
  'refuses settings host %s before invoking the original callback',
  async (host) => {
    fixture.getStore().setState({ browserSessionHostIdOverride: host })
    render(<Owner />)
    await expect(run({ action: 'import-browser', family: 'chrome' })).rejects.toThrow(
      'host_unsupported'
    )
    expect(fixture.browserImport).not.toHaveBeenCalled()
  }
)
it('does not invoke an inactive toolbar owner', async () => {
  render(<Owner active={false} />)
  await expect(
    run({ action: 'import-file', filePath: join(tmpdir(), 'cookies.json') })
  ).rejects.toThrow('inactive')
  expect(fixture.fileImport).not.toHaveBeenCalled()
})
it('rejects concurrent imports and does not acknowledge an unmounted owner', async () => {
  let resolve: ((value: typeof success) => void) | undefined
  fixture.browserImport.mockImplementation(
    () =>
      new Promise<typeof success>((done) => {
        resolve = done
      })
  )
  const owner = render(<Owner />)
  let pending: Promise<BrowserProfileUiState> | undefined
  await act(async () => {
    pending = requestBrowserProfileUi(
      'page',
      { action: 'import-browser', family: 'chrome' },
      Date.now() + 5000
    )
    void pending.catch(() => {})
  })
  await expect(run({ action: 'import-browser', family: 'firefox' })).rejects.toThrow('busy')
  owner.unmount()
  if (!pending || !resolve) {
    throw new Error('missing operation')
  }
  await expect(pending).rejects.toThrow('unavailable_effect_unknown')
  await act(async () => {
    resolve?.(success)
  })
  expect(fixture.browserImport).toHaveBeenCalledTimes(1)
})

it('uses original detection and its cached renderer list without claiming service verification', async () => {
  render(<Owner />)
  const result = await run({ action: 'detect-browsers' })
  expect(result.detection).toMatchObject({
    loaded: true,
    serviceVerified: false,
    browsers: [{ family: 'chrome' }]
  })
  await run({ action: 'detect-browsers' })
  expect(fixture.detect).toHaveBeenCalledTimes(1)
  expect(fixture.getStore().getState().detectedBrowsersLoaded).toBe(true)
})
it('reports the original loaded-empty fallback after a detection provider failure', async () => {
  fixture.detect.mockRejectedValue(new Error('detection unavailable'))
  render(<Owner />)
  expect((await run({ action: 'detect-browsers' })).detection).toEqual({
    loaded: true,
    browsers: [],
    serviceVerified: false
  })
})
