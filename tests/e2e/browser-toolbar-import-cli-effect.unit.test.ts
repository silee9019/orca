// @vitest-environment happy-dom
import { browserToolbarImportOwnerFixture } from './browser-toolbar-import-owner.fixture'
import { cookieFixture } from './browser-settings-cookie.fixture'
import { useAppStore } from '../../src/renderer/src/store'
import { afterEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { callRuntimeRpc } from '../../src/renderer/src/runtime/runtime-rpc-client'
import type { BrowserCookieImportResult } from '../../src/shared/browser-workspace-types'
vi.mock('../../src/main/browser/browser-cookie-staged-import', async () =>
  (await import('./browser-cookie-staged-import.fixture')).browserCookieStagedImportStub()
)

let fixture: Awaited<ReturnType<typeof browserToolbarImportOwnerFixture>> | undefined
afterEach(async () => {
  await fixture?.close()
  fixture = undefined
})
it('uses the mounted toolbar file callback and closes the original menu after selection', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  const success = vi.spyOn(toast, 'success')
  await fixture.invoke('menu-open')
  await fixture.invoke('import-file', ['--file', fixture.file, '--confirm', '--profile', 'default'])
  expect(cookieFixture.jars.size).toBe(1)
  expect(useAppStore.getState().browserSessionImportState?.status).toBe('success')
  expect(fixture.store.getUI().featureInteractions['cookie-import']?.interactionCount).toBe(1)
  expect(success).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[role="menu"]')).toBeNull()
  expect(fixture.output.mock.calls.flat().join(' ')).not.toContain('private-fixture-cookie-value')
})
it('rejects duplicate mounted toolbar owners before importing into a profile', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  await fixture.render(2)
  await expect(
    fixture.invoke('import-file', ['--file', fixture.file, '--confirm', '--profile', 'default'])
  ).rejects.toThrow()
  expect(cookieFixture.jars.size).toBe(0)
  expect(useAppStore.getState().browserSessionImportState).toBeNull()
})

it('uses the original browser callback and keeps the contextual tour menu open', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  await act(async () => {
    useAppStore.setState({
      activeContextualTourId: 'browser',
      activeContextualTourStepIndex: 2,
      browserImportHintHidden: true
    })
  })
  await fixture.invoke('import-browser', [
    '--family',
    'chrome',
    '--confirm',
    '--profile',
    'default'
  ])
  expect(cookieFixture.jars.size).toBe(1)
  expect(document.querySelector('[role="menu"]')).not.toBeNull()
  expect(fixture.store.getUI().featureInteractions['cookie-import']?.interactionCount).toBe(1)
})

it('rejects a Store target ABA while the existing provider is held', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  let release = (): void => {}
  cookieFixture.wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = fixture.invoke('import-file', [
    '--file',
    fixture.file,
    '--confirm',
    '--profile',
    'default'
  ])
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() =>
    expect(useAppStore.getState().browserSessionImportState?.status).toBe('importing')
  )
  await act(async () => {
    useAppStore.setState({ activeWorktreeId: 'other' })
    useAppStore.setState({ activeWorktreeId: 'work' })
  })
  await rejected
  expect(fixture.output).not.toHaveBeenCalled()
  await act(async () => {
    release()
  })
  await vi.waitFor(() => expect(cookieFixture.jars.size).toBe(1))
  expect(fixture.output).not.toHaveBeenCalled()
})

it('rejects a failed persistence read-back instead of acknowledging an imported cookie jar', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  Object.assign(window.api.ui, { get: async () => ({ featureInteractions: {} }) })
  await expect(
    fixture.invoke('import-file', ['--file', fixture.file, '--confirm', '--profile', 'default'])
  ).rejects.toThrow()
  expect(cookieFixture.jars.size).toBe(1)
  expect(fixture.output).not.toHaveBeenCalled()
})

it('requires explicit confirmation and the exact profile before provider effects', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  await expect(
    fixture.invoke('import-file', ['--file', fixture.file, '--profile', 'default'])
  ).rejects.toThrow()
  await expect(
    fixture.invoke('import-file', ['--file', fixture.file, '--confirm'])
  ).rejects.toThrow()
  await expect(
    fixture.invoke('import-file', ['--file', fixture.file, '--confirm', '--profile', 'other'])
  ).rejects.toThrow()
  expect(cookieFixture.jars.size).toBe(0)
  expect(useAppStore.getState().browserSessionImportState).toBeNull()
})

it('rejects an inactive toolbar owner before importing', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  await fixture.render(1, false)
  await expect(
    fixture.invoke('import-file', ['--file', fixture.file, '--confirm', '--profile', 'default'])
  ).rejects.toThrow()
  expect(cookieFixture.jars.size).toBe(0)
})

it('invalidates an in-flight import when its Store partition changes and returns in one act', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  let release = (): void => {}
  cookieFixture.wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = fixture.invoke('import-file', [
    '--file',
    fixture.file,
    '--confirm',
    '--profile',
    'default'
  ])
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() =>
    expect(useAppStore.getState().browserSessionImportState?.status).toBe('importing')
  )
  await act(async () => {
    const original = useAppStore.getState().browserTabsByWorktree
    useAppStore.setState({
      browserTabsByWorktree: {
        work: original.work.map((tab) => ({ ...tab, sessionPartition: 'other-partition' }))
      }
    })
    useAppStore.setState({ browserTabsByWorktree: original })
  })
  await rejected
  await act(async () => {
    release()
  })
  await vi.waitFor(() => expect(cookieFixture.jars.size).toBe(1))
  expect(fixture.output).not.toHaveBeenCalled()
})

it('does not turn request expiry into provider cancellation or allow a replacement import', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  let release = (): void => {}
  cookieFixture.wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = fixture.invoke('import-file', [
    '--file',
    fixture.file,
    '--confirm',
    '--profile',
    'default'
  ])
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() =>
    expect(useAppStore.getState().browserSessionImportState?.status).toBe('importing')
  )
  await rejected
  await expect(
    fixture.invoke('import-file', ['--file', fixture.file, '--confirm', '--profile', 'default'])
  ).rejects.toThrow()
  expect(cookieFixture.jars.size).toBe(0)
  await act(async () => {
    release()
  })
  await vi.waitFor(() => expect(cookieFixture.jars.size).toBe(1))
  expect(fixture.output).not.toHaveBeenCalled()
}, 10000)

it('compares the original dropdown file selection with the CLI using only a fake chooser', async () => {
  fixture = await browserToolbarImportOwnerFixture()
  const file = fixture.file
  const chooser = vi.fn(async ({ profileId }: { profileId: string }) =>
    callRuntimeRpc<BrowserCookieImportResult>({ kind: 'local' }, 'browser.profileImportFile', {
      profileId,
      filePath: file
    })
  )
  Object.assign(window.api.browser, { sessionImportCookies: chooser })
  await fixture.invoke('menu-open')
  const trigger = Array.from(document.querySelectorAll('[role="menuitem"]')).find((item) =>
    item.textContent?.includes('Import Cookies')
  )
  if (!trigger) {
    throw new Error('original import submenu missing')
  }
  await act(async () => {
    fireEvent.click(trigger)
  })
  const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((entry) =>
    entry.textContent?.includes('From File')
  )
  if (!item) {
    throw new Error('original file selection missing')
  }
  await act(async () => {
    fireEvent.click(item)
  })
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(useAppStore.getState().browserSessionImportState?.status).toBe('success')
  })
  expect(chooser).toHaveBeenCalledWith({ profileId: 'default' })
  expect(cookieFixture.jars.size).toBe(1)
  expect(document.querySelector('[role="menu"]')).toBeNull()
  await fixture.invoke('menu-open')
  await fixture.invoke('import-file', ['--file', file, '--confirm', '--profile', 'default'])
  expect(chooser).toHaveBeenCalledTimes(1)
  expect(fixture.store.getUI().featureInteractions['cookie-import']?.interactionCount).toBe(2)
  expect(document.querySelector('[role="menu"]')).toBeNull()
})
