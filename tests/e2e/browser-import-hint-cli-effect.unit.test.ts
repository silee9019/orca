// @vitest-environment happy-dom
import { act } from 'react'
import { requestBrowserImportHint } from '../../src/renderer/src/runtime/browser-import-hint-request'
import { expect, it, vi } from 'vitest'
import { browserImportHintOwnerSocketFixture } from './browser-import-hint-owner-socket.fixture'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'controls the existing mounted import hint through CLI/socket and reads committed UI/store state',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    try {
      await fixture.invoke('status')
      expect(fixture.detect).not.toHaveBeenCalled()
      await fixture.invoke('open')
      expect(fixture.detect).toHaveBeenCalledTimes(1)
      expect(useAppStore.getState().detectedBrowsersLoaded).toBe(true)
      expect(document.body.textContent).toContain('Fake Chrome')
      await fixture.invoke('menu-open')
      expect(document.body.textContent).toContain('From File')
      await fixture.invoke('close')
      expect(
        JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserImportHint
      ).toMatchObject({ open: false, menuOpen: false })
      await fixture.invoke('open')
      await fixture.invoke('settings')
      expect(useAppStore.getState()).toMatchObject({
        activeView: 'settings',
        settingsNavigationTarget: { pane: 'browser', repoId: null }
      })
      expect(
        JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserImportHint.settingsOpened
      ).toBe(true)
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'rejects ambiguous, inactive, expired and exact target mismatches before detection',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    const command = {
      hostId: 'local',
      pageId: 'page',
      profileId: 'default',
      action: 'open' as const
    }
    try {
      await fixture.renderOwner(2)
      await expect(fixture.invoke('open')).rejects.toThrow('browser_import_hint_owner_ambiguous')
      await fixture.renderOwner(1, false)
      await expect(fixture.invoke('open')).rejects.toThrow(
        'browser_import_hint_owner_busy_or_inactive'
      )
      await fixture.renderOwner()
      await expect(requestBrowserImportHint(command, Date.now() - 1)).rejects.toThrow(
        'browser_import_hint_request_expired'
      )
      await expect(fixture.invoke('open', ['--page', 'other'])).rejects.toThrow(
        'browser_import_hint_target_mismatch'
      )
      await expect(fixture.invoke('open', ['--profile', 'other'])).rejects.toThrow(
        'browser_import_hint_target_mismatch'
      )
      await expect(fixture.invoke('open', ['--host', 'runtime:other'])).rejects.toThrow(
        'browser_import_hint_host_mismatch'
      )
      await act(async () => useAppStore.setState({ activeModal: 'quick-open' }))
      await expect(fixture.invoke('open')).rejects.toThrow('browser_import_hint_surface_inactive')
      expect(fixture.detect).not.toHaveBeenCalled()
    } finally {
      await fixture.close()
    }
  }
)
it.skipIf(process.platform === 'win32')(
  'retains the existing client-host detection route with an exact runtime/page/import-host match',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    try {
      await act(async () => {
        const state = useAppStore.getState()
        useAppStore.setState({
          settings: { ...state.settings!, activeRuntimeEnvironmentId: 'remote' },
          browserPagesByWorkspace: {
            tab: state.browserPagesByWorkspace.tab.map((page) => ({
              ...page,
              browserRuntimeEnvironmentId: 'remote'
            }))
          }
        })
      })
      await expect(fixture.invoke('open')).rejects.toThrow('browser_import_hint_host_mismatch')
      await fixture.invoke('open', ['--host', 'runtime:remote'])
      expect(fixture.detect).toHaveBeenCalledExactlyOnceWith({ environmentId: 'remote' })
      expect(useAppStore.getState().detectedBrowsersHost?.machine).toBe('client')
      expect(
        JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserImportHint
      ).toMatchObject({ open: true, detectionSettled: true })
    } finally {
      await fixture.close()
    }
  }
)
it.skipIf(process.platform === 'win32')(
  'does not acknowledge held detection after a newer UI close or host replacement',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    try {
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      fixture.detect.mockImplementationOnce(async () => {
        await held
        return []
      })
      const operation = fixture.invoke('open')
      const rejected = expect(operation).rejects.toThrow('browser_import_hint_effect_unknown')
      await vi.waitFor(() => expect(fixture.detect).toHaveBeenCalledTimes(1))
      expect(fixture.output).not.toHaveBeenCalled()
      await expect(fixture.invoke('close')).rejects.toThrow(
        'browser_import_hint_owner_busy_or_inactive'
      )
      await act(async () => window.dispatchEvent(new Event('blur')))
      release()
      await rejected
      expect(fixture.output).not.toHaveBeenCalled()
      await fixture.invoke('open')
      expect(JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserImportHint.open).toBe(
        true
      )
    } finally {
      await fixture.close()
    }
    const replaced = await browserImportHintOwnerSocketFixture()
    try {
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      replaced.detect.mockImplementationOnce(async () => {
        await held
        return []
      })
      const operation = replaced.invoke('open')
      const rejected = expect(operation).rejects.toThrow('browser_import_hint_effect_unknown')
      await vi.waitFor(() => expect(replaced.detect).toHaveBeenCalledTimes(1))
      await act(async () =>
        useAppStore.setState({ browserSessionHostIdOverride: 'runtime:changed' })
      )
      release()
      await rejected
      expect(replaced.output).not.toHaveBeenCalled()
      expect(useAppStore.getState().detectedBrowsersLoaded).toBe(false)
    } finally {
      await replaced.close()
    }
  }
)
it.skipIf(process.platform === 'win32')(
  'reports best-effort detection settlement without exposing private provider errors or claiming import',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    try {
      fixture.detect.mockRejectedValueOnce(new Error('private browser directory'))
      await fixture.invoke('open')
      const text = fixture.output.mock.calls.at(-1)?.[0]
      expect(text).not.toContain('private browser directory')
      expect(JSON.parse(text).result.browserImportHint).toMatchObject({
        open: true,
        detectionSettled: true
      })
      expect(useAppStore.getState().browserSessionImportState).toBeNull()
      await fixture.invoke('menu-open')
      await fixture.invoke('menu-close')
      expect(
        JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserImportHint.menuOpen
      ).toBe(false)
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'refuses paired viewers and unknown canonical modal state before effects',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    try {
      Reflect.set(globalThis, '__ORCA_WEB_CLIENT__', true)
      await expect(fixture.invoke('open')).rejects.toThrow('browser_import_hint_viewer_unavailable')
      Reflect.deleteProperty(globalThis, '__ORCA_WEB_CLIENT__')
      const state = useAppStore.getState()
      Reflect.deleteProperty(state, 'activeModal')
      await expect(fixture.invoke('open')).rejects.toThrow('browser_import_hint_surface_inactive')
      expect(fixture.detect).not.toHaveBeenCalled()
      useAppStore.setState({ activeModal: 'none' })
    } finally {
      Reflect.deleteProperty(globalThis, '__ORCA_WEB_CLIENT__')
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32').each(['activity', 'target', 'mount'])(
  'rejects a held detection after its owner binding cycles: %s',
  async (cycle) => {
    const fixture = await browserImportHintOwnerSocketFixture()
    let release = () => {}
    try {
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      fixture.detect.mockImplementationOnce(async () => {
        await held
        return []
      })
      const operation = fixture.invoke('open')
      const rejected = expect(operation).rejects.toThrow('browser_import_hint_effect_unknown')
      await vi.waitFor(() => expect(fixture.detect).toHaveBeenCalledTimes(1))
      if (cycle === 'activity') {
        await fixture.renderOwner(1, false)
        await fixture.renderOwner(1, true)
      } else if (cycle === 'target') {
        await fixture.renderOwner(1, true, 'other-page', 'other-profile')
        await fixture.renderOwner()
      } else {
        await fixture.renderOwner(0)
        await fixture.renderOwner()
        await act(async () =>
          document.querySelector<HTMLButtonElement>('[data-browser-import-hint-page]')?.click()
        )
      }
      await act(async () => release())
      await rejected
      expect(fixture.output).not.toHaveBeenCalled()
    } finally {
      release()
      await fixture.close()
    }
  }
)
