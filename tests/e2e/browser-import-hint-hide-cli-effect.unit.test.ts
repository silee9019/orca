// @vitest-environment happy-dom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { browserImportHintOwnerSocketFixture } from './browser-import-hint-owner-socket.fixture'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'hides through the actual owner and waits for UI persistence before reading storage',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    try {
      await expect(fixture.invoke('hide')).rejects.toThrow()
      expect(fixture.writeUI).not.toHaveBeenCalled()
      await fixture.invoke('hide', ['--confirm', 'hide-browser-import-hint'])
      expect(fixture.writeUI).toHaveBeenCalledExactlyOnceWith({ browserImportHintHidden: true })
      expect(fixture.readUI).toHaveBeenCalledTimes(1)
      expect(fixture.store.getUI().browserImportHintHidden).toBe(true)
      expect(useAppStore.getState().browserImportHintHidden).toBe(true)
      expect(document.querySelector('[data-browser-import-hint-page]')).toBeNull()
      expect(
        JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserImportHint
      ).toMatchObject({ hidden: true, persisted: true, open: false, menuOpen: false })
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'does not read or acknowledge a pending or failed UI write',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    try {
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const write = fixture.writeUI.getMockImplementation()!
      fixture.writeUI.mockImplementationOnce(async (updates) => {
        await held
        return write(updates)
      })
      const operation = fixture.invoke('hide', ['--confirm', 'hide-browser-import-hint'])
      await vi.waitFor(() => expect(fixture.writeUI).toHaveBeenCalledTimes(1))
      expect(fixture.readUI).not.toHaveBeenCalled()
      expect(fixture.output).not.toHaveBeenCalled()
      expect(useAppStore.getState().browserImportHintHidden).toBe(true)
      expect(fixture.store.getUI().browserImportHintHidden).not.toBe(true)
      release()
      await operation
      expect(fixture.readUI).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.close()
    }
    const failed = await browserImportHintOwnerSocketFixture()
    try {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      failed.writeUI.mockRejectedValueOnce(new Error('private UI provider error'))
      await expect(
        failed.invoke('hide', ['--confirm', 'hide-browser-import-hint'])
      ).rejects.toThrow('browser_import_hint_effect_unknown')
      expect(failed.readUI).not.toHaveBeenCalled()
      expect(failed.output).not.toHaveBeenCalled()
      expect(useAppStore.getState().browserImportHintHidden).toBe(true)
      expect(failed.store.getUI().browserImportHintHidden).not.toBe(true)
    } finally {
      await failed.close()
    }
  }
)
it.skipIf(process.platform === 'win32')(
  'refuses success after a newer UI reveal, stale storage readback or target departure',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    try {
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const write = fixture.writeUI.getMockImplementation()!
      fixture.writeUI.mockImplementationOnce(async (updates) => {
        await held
        return write(updates)
      })
      const operation = fixture.invoke('hide', ['--confirm', 'hide-browser-import-hint'])
      const rejected = expect(operation).rejects.toThrow('browser_import_hint_effect_unknown')
      await vi.waitFor(() => expect(fixture.writeUI).toHaveBeenCalledTimes(1))
      await act(async () => useAppStore.getState().setBrowserImportHintHidden(false))
      release()
      await rejected
      expect(fixture.readUI).not.toHaveBeenCalled()
      expect(fixture.output).not.toHaveBeenCalled()
      expect(useAppStore.getState().browserImportHintHidden).toBe(false)
    } finally {
      await fixture.close()
    }
    const stale = await browserImportHintOwnerSocketFixture()
    try {
      stale.readUI.mockResolvedValueOnce({ ...stale.store.getUI(), browserImportHintHidden: false })
      await expect(stale.invoke('hide', ['--confirm', 'hide-browser-import-hint'])).rejects.toThrow(
        'browser_import_hint_effect_unknown'
      )
      expect(stale.store.getUI().browserImportHintHidden).toBe(true)
      expect(stale.output).not.toHaveBeenCalled()
    } finally {
      await stale.close()
    }
    const departed = await browserImportHintOwnerSocketFixture()
    try {
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const write = departed.writeUI.getMockImplementation()!
      departed.writeUI.mockImplementationOnce(async (updates) => {
        await held
        return write(updates)
      })
      const operation = departed.invoke('hide', ['--confirm', 'hide-browser-import-hint'])
      const rejected = expect(operation).rejects.toThrow('browser_import_hint_effect_unknown')
      await vi.waitFor(() => expect(departed.writeUI).toHaveBeenCalledTimes(1))
      await act(async () => useAppStore.setState({ activeView: 'settings' }))
      release()
      await rejected
      expect(departed.readUI).not.toHaveBeenCalled()
      expect(departed.output).not.toHaveBeenCalled()
    } finally {
      await departed.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'rejects a receipt superseded during its held storage read even when the final hidden value matches',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    try {
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      fixture.readUI.mockImplementationOnce(async () => {
        await held
        return fixture.store.getUI()
      })
      const operation = fixture.invoke('hide', ['--confirm', 'hide-browser-import-hint'])
      const rejected = expect(operation).rejects.toThrow('browser_import_hint_effect_unknown')
      await vi.waitFor(() => expect(fixture.readUI).toHaveBeenCalledTimes(1))
      await act(async () => {
        useAppStore.getState().setBrowserImportHintHidden(false)
        useAppStore.getState().setBrowserImportHintHidden(true)
      })
      release()
      await rejected
      expect(fixture.store.getUI().browserImportHintHidden).toBe(true)
      expect(fixture.output).not.toHaveBeenCalled()
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'does not read storage or claim rollback after the writer outlives request expiry',
  async () => {
    const fixture = await browserImportHintOwnerSocketFixture()
    let release = () => {}
    try {
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const write = fixture.writeUI.getMockImplementation()!
      fixture.writeUI.mockImplementationOnce(async (updates) => {
        await held
        return write(updates)
      })
      await expect(
        fixture.invoke('hide', ['--confirm', 'hide-browser-import-hint'])
      ).rejects.toThrow('browser_import_hint_timeout_effect_unknown')
      expect(fixture.readUI).not.toHaveBeenCalled()
      expect(fixture.output).not.toHaveBeenCalled()
      release()
      await vi.waitFor(() => expect(fixture.store.getUI().browserImportHintHidden).toBe(true))
      expect(useAppStore.getState().browserImportHintHidden).toBe(true)
      expect(fixture.readUI).not.toHaveBeenCalled()
    } finally {
      release()
      await fixture.close()
    }
  }
)
