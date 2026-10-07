// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { requestBrowserSetupGuide } from '../../src/renderer/src/runtime/browser-setup-guide-request'
import { useAppStore } from '../../src/renderer/src/store'
import { expect, it, vi } from 'vitest'
import { browserSetupGuideOwnerSocketFixture } from './browser-setup-guide-owner-socket.fixture'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '../../src/renderer/src/lib/browser-use-setup-state'
import { ORCHESTRATION_ENABLED_STORAGE_KEY } from '../../src/renderer/src/lib/orchestration-setup-state'
vi.mock('../../src/renderer/src/components/onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: ({ command }: { command: string }) =>
    createElement('div', { 'data-fake-setup-terminal': true }, command)
}))
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'prepares the existing setup guide owner through CLI/socket and fake clipboard/terminal providers',
  async () => {
    localStorage.setItem(ORCHESTRATION_ENABLED_STORAGE_KEY, '1')
    localStorage.removeItem(BROWSER_USE_ENABLED_STORAGE_KEY)
    const fixture = await browserSetupGuideOwnerSocketFixture()
    try {
      await expect(fixture.invoke('prepare-install')).rejects.toThrow()
      await expect(fixture.invoke('prepare-install', 'other-target')).rejects.toThrow()
      expect(fixture.writeClipboardText).not.toHaveBeenCalled()
      await fixture.invoke('prepare-install', 'browser-use-setup')
      expect(fixture.writeClipboardText).toHaveBeenCalledTimes(1)
      expect(fixture.readClipboardText).toHaveBeenCalledTimes(1)
      expect(fixture.container.querySelector('[data-fake-setup-terminal]')?.textContent).toBe(
        fixture.writeClipboardText.mock.calls[0][0]
      )
      expect(localStorage.getItem(BROWSER_USE_ENABLED_STORAGE_KEY)).toBe('1')
      expect(localStorage.getItem(ORCHESTRATION_ENABLED_STORAGE_KEY)).toBe('0')
      expect(
        fixture.store.getUI().featureInteractions?.['agent-browser-setup']?.interactionCount
      ).toBe(1)
      const output = fixture.output.mock.calls.at(-1)?.[0]
      expect(JSON.parse(output).result.browserSetupGuide).toMatchObject({
        commandPrepared: true,
        clipboardCopied: true,
        warningPresent: false,
        busy: false
      })
      expect(output).not.toContain(fixture.writeClipboardText.mock.calls[0][0])
      await expect(fixture.invoke('prepare-install', 'browser-use-setup')).rejects.toThrow(
        'browser_setup_guide_prepare_busy_or_unavailable'
      )
      expect(fixture.writeClipboardText).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.close()
      localStorage.removeItem(ORCHESTRATION_ENABLED_STORAGE_KEY)
      localStorage.removeItem(BROWSER_USE_ENABLED_STORAGE_KEY)
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'awaits clipboard writes and reports the existing warning on write failure without reading',
  async () => {
    const fixture = await browserSetupGuideOwnerSocketFixture()
    try {
      let release = (): void => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const write = fixture.writeClipboardText.getMockImplementation()!
      fixture.writeClipboardText.mockImplementationOnce(async (value) => {
        await held
        await write(value)
      })
      const operation = fixture.invoke('prepare-install', 'browser-use-setup')
      await vi.waitFor(() => expect(fixture.writeClipboardText).toHaveBeenCalledTimes(1))
      expect(fixture.readClipboardText).not.toHaveBeenCalled()
      expect(fixture.container.querySelector('[data-fake-setup-terminal]')).toBeNull()
      expect(fixture.output).not.toHaveBeenCalled()
      release()
      await operation
      expect(fixture.readClipboardText).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.close()
    }
    const failed = await browserSetupGuideOwnerSocketFixture()
    try {
      failed.writeClipboardText.mockRejectedValueOnce(
        new Error('private clipboard provider failure')
      )
      await failed.invoke('prepare-install', 'browser-use-setup')
      expect(failed.readClipboardText).not.toHaveBeenCalled()
      expect(failed.container.querySelector('[data-fake-setup-terminal]')).not.toBeNull()
      expect(
        JSON.parse(failed.output.mock.calls.at(-1)?.[0]).result.browserSetupGuide
      ).toMatchObject({
        commandPrepared: true,
        clipboardCopied: false,
        warningPresent: true
      })
      expect(failed.output.mock.calls.at(-1)?.[0]).not.toContain(
        'private clipboard provider failure'
      )
    } finally {
      await failed.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'rejects duplicate/inactive owners and protects UI install before React commits',
  async () => {
    const fixture = await browserSetupGuideOwnerSocketFixture()
    try {
      await fixture.renderOwner(2)
      await expect(fixture.invoke('prepare-install', 'browser-use-setup')).rejects.toThrow(
        'owner_ambiguous'
      )
      expect(fixture.writeClipboardText).not.toHaveBeenCalled()
      await fixture.renderOwner()
      await act(async () => useAppStore.setState({ activeModal: 'none', activeView: 'terminal' }))
      await expect(fixture.invoke('prepare-install', 'browser-use-setup')).rejects.toThrow(
        'surface_inactive'
      )
      expect(fixture.writeClipboardText).not.toHaveBeenCalled()
      await act(async () => useAppStore.setState({ activeModal: 'setup-guide' }))
      let release = (): void => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const write = fixture.writeClipboardText.getMockImplementation()!
      fixture.writeClipboardText.mockImplementationOnce(async (value) => {
        await held
        await write(value)
      })
      await act(async () => {
        fixture.container.querySelector('button')?.click()
        await expect(
          requestBrowserSetupGuide(
            {
              action: 'prepare-install',
              confirm: 'browser-use-setup',
              surface: 'modal',
              runtime: 'local',
              workspaceId: null
            },
            Date.now() + 3000
          )
        ).rejects.toThrow('prepare_busy_or_unavailable')
      })
      expect(fixture.writeClipboardText).toHaveBeenCalledTimes(1)
      await act(async () => {
        release()
        await held
      })
      await vi.waitFor(() =>
        expect(fixture.container.querySelector('[data-fake-setup-terminal]')).not.toBeNull()
      )
      expect(fixture.writeClipboardText).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'does not acknowledge mismatched clipboard or a late operation after the modal changes',
  async () => {
    const fixture = await browserSetupGuideOwnerSocketFixture()
    try {
      fixture.readClipboardText.mockResolvedValueOnce('different private clipboard')
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(fixture.invoke('prepare-install', 'browser-use-setup')).rejects.toThrow(
        'effect_unknown'
      )
      expect(fixture.container.querySelector('[data-fake-setup-terminal]')).toBeNull()
      expect(fixture.recordInteraction).not.toHaveBeenCalled()
      error.mockRestore()
    } finally {
      await fixture.close()
    }
    const late = await browserSetupGuideOwnerSocketFixture()
    try {
      let release = (): void => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const write = late.writeClipboardText.getMockImplementation()!
      late.writeClipboardText.mockImplementationOnce(async (value) => {
        await held
        await write(value)
      })
      const operation = late.invoke('prepare-install', 'browser-use-setup')
      const rejection = expect(operation).rejects.toThrow('effect_unknown')
      await vi.waitFor(() => expect(late.writeClipboardText).toHaveBeenCalledTimes(1))
      await act(async () => useAppStore.setState({ activeModal: 'quick-open' }))
      release()
      await rejection
      expect(late.readClipboardText).not.toHaveBeenCalled()
      expect(late.recordInteraction).not.toHaveBeenCalled()
      expect(late.container.querySelector('[data-fake-setup-terminal]')).toBeNull()
    } finally {
      await late.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'prepares the settings surface only when the canonical modal is none',
  async () => {
    const fixture = await browserSetupGuideOwnerSocketFixture()
    try {
      await act(async () => useAppStore.setState({ activeModal: 'none', activeView: 'settings' }))
      await fixture.invoke('prepare-install', 'browser-use-setup', 'settings')
      expect(fixture.container.querySelector('[data-fake-setup-terminal]')).not.toBeNull()
      expect(
        JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserSetupGuide.commandPrepared
      ).toBe(true)
    } finally {
      await fixture.close()
    }
  }
)
