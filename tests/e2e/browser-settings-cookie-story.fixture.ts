import { act } from 'react'
import { expect, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cookieFixture } from './browser-settings-cookie.fixture'
import { browserSessionRegistry } from '../../src/main/browser/browser-session-registry'
import { useAppStore } from '../../src/renderer/src/store'
import type { Store } from '../../src/main/persistence'
export async function verifyBrowserSettingsCookies(
  invoke: (action: string, flags?: string[], host?: string, pump?: boolean) => Promise<void>,
  created: { id: string; partition: string },
  directory: string,
  container: HTMLElement,
  store: Store,
  output: { mock: { calls: unknown[][] } }
): Promise<void> {
  await invoke('detect-browsers', ['--profile', created.id, '--surface', 'profile-row'])
  expect(useAppStore.getState().detectedBrowsers.map((value) => value.family)).toEqual(['chrome'])
  let release: (() => void) | undefined
  cookieFixture.wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const importing = invoke(
    'cookies-import-browser',
    [
      '--profile',
      created.id,
      '--surface',
      'profile-row',
      '--browser-family',
      'chrome',
      '--confirm',
      created.id
    ],
    'local',
    false
  )
  void importing.catch(() => {})
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(useAppStore.getState().browserSessionImportState?.status).toBe('importing')
  })
  await invoke('profile-status', ['--profile', created.id, '--surface', 'profile-row'])
  expect(output.mock.calls.at(-1)?.[0]).toContain('"importStatus": "importing"')
  release?.()
  await vi.waitFor(async () => {
    await act(async () => {})
    expect(useAppStore.getState().browserSessionImportState?.status).toBe('success')
  })
  await importing
  expect(cookieFixture.jars.get(created.partition)).toBe('private-fixture-browser-cookie')
  expect(useAppStore.getState().browserSessionImportState?.status).toBe('success')
  expect(container.textContent).toContain('Chrome')
  const file = join(directory, 'cookies.json')
  writeFileSync(file, 'private-fixture-file-cookie', { mode: 0o600 })
  await invoke('cookies-import-file', [
    '--profile',
    'default',
    '--surface',
    'browser-use',
    '--file',
    file,
    '--confirm',
    'default'
  ])
  const defaultProfile = browserSessionRegistry.getDefaultProfile()
  expect(cookieFixture.jars.get(defaultProfile.partition)).toBe('private-fixture-file-cookie')
  expect(
    useAppStore.getState().browserSessionProfiles.find((value) => value.id === 'default')?.source
      ?.browserFamily
  ).toBe('manual')
  await invoke('cookies-import-file', [
    '--profile',
    created.id,
    '--surface',
    'profile-row',
    '--file',
    file,
    '--confirm',
    created.id
  ])
  expect(cookieFixture.jars.get(created.partition)).toBe('private-fixture-file-cookie')
  await invoke('detect-browsers', ['--profile', 'default', '--surface', 'browser-use'])
  await invoke('cookies-import-browser', [
    '--profile',
    'default',
    '--surface',
    'browser-use',
    '--browser-family',
    'chrome',
    '--confirm',
    'default'
  ])
  expect(cookieFixture.jars.get(defaultProfile.partition)).toBe('private-fixture-browser-cookie')
  await invoke('default-cookies-clear', ['--profile', 'default', '--confirm', 'default'])
  expect(cookieFixture.jars.has(defaultProfile.partition)).toBe(false)
  expect(
    useAppStore.getState().browserSessionProfiles.find((value) => value.id === 'default')?.source
  ).toBeNull()
  await expect(
    invoke('profile-delete', ['--profile', created.id, '--confirm', 'different-profile'])
  ).rejects.toThrow('browser_settings_action_failed_effect_unknown')
  expect(browserSessionRegistry.getProfile(created.id)).toBeDefined()
  await invoke('profile-delete', ['--profile', created.id, '--confirm', created.id])
  expect(browserSessionRegistry.getProfile(created.id)).toBeNull()
  expect(cookieFixture.jars.has(created.partition)).toBe(false)
  expect(
    useAppStore.getState().browserSessionProfiles.some((value) => value.id === created.id)
  ).toBe(false)
  expect(store.getUI().featureInteractions?.['cookie-import']?.interactionCount).toBe(5)
  expect(JSON.stringify(output.mock.calls)).not.toContain('private-fixture')
}
