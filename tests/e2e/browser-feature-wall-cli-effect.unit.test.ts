import { INSTALLED_AGENT_SKILLS_REFRESHED_EVENT } from '../../src/renderer/src/hooks/installed-agent-skills-change-event'
// @vitest-environment happy-dom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { browserFeatureWallOwnerSocketFixture } from './browser-feature-wall-owner-socket.fixture'
import { useAppStore } from '../../src/renderer/src/store'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '../../src/renderer/src/lib/browser-use-setup-state'
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'uses the mounted tour skill owner through CLI/socket with committed discovery and setup intent readback',
  async () => {
    localStorage.removeItem(BROWSER_USE_ENABLED_STORAGE_KEY)
    const fixture = await browserFeatureWallOwnerSocketFixture()
    try {
      await fixture.invoke('recheck')
      expect(fixture.discover).toHaveBeenCalledTimes(2)
      expect(fixture.container.textContent).toContain('Not installed')
      const read = JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserFeatureWall
      expect(read).toMatchObject({
        installed: false,
        settled: true,
        loading: false,
        unverifiable: false
      })
      await fixture.invoke('install-intent')
      expect(localStorage.getItem(BROWSER_USE_ENABLED_STORAGE_KEY)).toBe('1')
      expect(
        fixture.store.getUI().featureInteractions?.['agent-browser-setup']?.interactionCount
      ).toBe(1)
      expect(
        JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserFeatureWall
          .interactionRecorded
      ).toBe(true)
      expect(fixture.container.textContent).not.toContain('Press Enter to run')
      await expect(fixture.invoke('recheck', 'another-workspace')).rejects.toThrow(
        'browser_feature_wall_workspace_mismatch'
      )
      expect(fixture.discover).toHaveBeenCalledTimes(2)
      await fixture.renderOwner(2)
      const count = fixture.discover.mock.calls.length
      await expect(fixture.invoke('recheck')).rejects.toThrow(
        'browser_feature_wall_owner_ambiguous'
      )
      expect(fixture.discover).toHaveBeenCalledTimes(count)
    } finally {
      await fixture.close()
      localStorage.removeItem(BROWSER_USE_ENABLED_STORAGE_KEY)
    }
  }
)
it.skipIf(process.platform === 'win32')(
  'rejects failed scans and late modal replacement without successful output',
  async () => {
    const fixture = await browserFeatureWallOwnerSocketFixture()
    let release = (): void => {}
    try {
      fixture.discover.mockRejectedValueOnce(new Error('private-discovery-error'))
      await expect(fixture.invoke('recheck')).rejects.toThrow('browser_feature_wall_effect_unknown')
      expect(fixture.output.mock.calls).toHaveLength(0)
      fixture.discover.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return fixture.discovery
      })
      const late = fixture.invoke('recheck')
      void late.catch(() => {})
      await vi.waitFor(() => expect(fixture.discover).toHaveBeenCalledTimes(3))
      await act(async () => {
        useAppStore.setState({ activeModal: 'quick-open' })
        release()
      })
      await expect(late).rejects.toThrow('browser_feature_wall_effect_unknown')
      expect(fixture.output.mock.calls).toHaveLength(0)
      expect(useAppStore.getState().activeModal).toBe('quick-open')
    } finally {
      release()
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'rejects inactive and mismatched runtime owners before setup intent effects',
  async () => {
    const fixture = await browserFeatureWallOwnerSocketFixture()
    try {
      await act(async () => useAppStore.setState({ activeModal: 'none' }))
      await expect(fixture.invoke('install-intent')).rejects.toThrow(
        'browser_feature_wall_inactive'
      )
      expect(fixture.recordInteraction).not.toHaveBeenCalled()
      await act(async () =>
        useAppStore.setState({
          activeModal: 'feature-wall',
          runtimeEnvironmentCatalogSettled: false
        })
      )
      await expect(fixture.invoke('install-intent')).rejects.toThrow(
        'browser_feature_wall_runtime_mismatch'
      )
      expect(fixture.recordInteraction).not.toHaveBeenCalled()
      await act(async () => useAppStore.setState({ runtimeEnvironmentCatalogSettled: true }))
      await fixture.renderOwner(2)
      await expect(fixture.invoke('install-intent')).rejects.toThrow(
        'browser_feature_wall_owner_ambiguous'
      )
      expect(fixture.recordInteraction).not.toHaveBeenCalled()
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'rejects an unmounted card receipt when a CLI discovery finishes late',
  async () => {
    const fixture = await browserFeatureWallOwnerSocketFixture()
    let release = (): void => {}
    try {
      fixture.discover.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return { ...fixture.discovery, scannedAt: 2 }
      })
      const older = fixture.invoke('recheck')
      void older.catch(() => {})
      await vi.waitFor(() => expect(fixture.discover).toHaveBeenCalledTimes(2))
      await fixture.renderOwner(0)
      await expect(older).rejects.toThrow('browser_feature_wall_owner_changed_effect_unknown')
      await act(async () => release())
      await fixture.renderOwner(1)
      expect(fixture.container.textContent).toContain('Not installed')
      expect(fixture.output.mock.calls).toHaveLength(0)
    } finally {
      release()
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'rejects a retired typed scan after the actual Re-check callback starts before commit',
  async () => {
    const fixture = await browserFeatureWallOwnerSocketFixture()
    const refreshed = vi.fn()
    window.addEventListener(INSTALLED_AGENT_SKILLS_REFRESHED_EVENT, refreshed)
    const { requestBrowserFeatureWall } =
      await import('../../src/renderer/src/runtime/browser-feature-wall-request')
    let release = (): void => {}
    try {
      fixture.discover.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return fixture.discovery
      })
      let older: Promise<unknown> | undefined
      await act(async () => {
        older = requestBrowserFeatureWall(
          { action: 'recheck', runtime: 'local', workspaceId: null },
          Date.now() + 3000
        )
        void older.catch(() => {})
        for (let turn = 0; turn < 10; turn++) {
          await Promise.resolve()
        }
        Array.from(fixture.container.querySelectorAll('button'))
          .find((button) => button.textContent === 'Re-check')
          ?.click()
        for (let turn = 0; turn < 10; turn++) {
          await Promise.resolve()
        }
      })
      expect(fixture.discover).toHaveBeenCalledTimes(2)
      await act(async () => release())
      await expect(older).rejects.toThrow('browser_feature_wall_effect_unknown')
      expect(refreshed).toHaveBeenCalled()
      expect(fixture.container.textContent).toContain('Not installed')
    } finally {
      window.removeEventListener(INSTALLED_AGENT_SKILLS_REFRESHED_EVENT, refreshed)
      release()
      await fixture.close()
    }
  }
)
