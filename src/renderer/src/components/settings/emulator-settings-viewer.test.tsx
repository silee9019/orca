// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { AppState } from '@/store/types'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import { MobileEmulatorSettingsPane } from './MobileEmulatorSettingsPane'
import { MobileEmulatorExamples } from './MobileEmulatorExamples'
import { applyEmulatorSettingsViewerRequest } from '@/runtime/emulator-settings-viewer'
const owners = vi.hoisted(() => ({ availability: vi.fn(), picker: vi.fn(), open: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: owners.availability }))
vi.mock('./MobileEmulatorAgentControlRow', () => ({ MobileEmulatorAgentControlRow: () => null }))
const availability = {
  platform: 'darwin',
  available: true,
  devices: [
    { udid: 'device-a', name: 'private-device-name-canary', state: 'Shutdown', isAvailable: true }
  ],
  simctl: { ok: true },
  serveSim: { ok: true },
  android: { sdkFound: false, message: '' },
  message: ''
}
let persisted: GlobalSettings
let applyWrites = true
const write = vi.fn<AppState['updateSettings']>(async (updates) => {
  if (!applyWrites) {
    return
  }
  persisted = { ...persisted, ...updates }
  useAppStore.setState({ settings: persisted })
})
function Surface() {
  const settings = useAppStore((state) => state.settings)
  return settings ? <MobileEmulatorSettingsPane settings={settings} updateSettings={write} /> : null
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applyEmulatorSettingsViewerRequest> | undefined
  await act(async () => {
    pending = applyEmulatorSettingsViewerRequest({
      id: 'settings-fixture',
      expiresAt: Date.now() + 300,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
async function mount() {
  render(<Surface />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Locate SDK folder' })).toBeInTheDocument()
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  applyWrites = true
  persisted = { ...getDefaultSettings('/fixture'), mobileEmulatorEnabled: true }
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ settings: persisted })
  owners.availability.mockResolvedValue(availability)
  owners.picker.mockResolvedValue(null)
  owners.open.mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      settings: { get: vi.fn(async () => persisted) },
      shell: { pickDirectory: owners.picker, openUrl: owners.open }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('uses the existing private SDK setting then local availability refresh and canonical readback', async () => {
  await mount()
  const result = await invoke({
    viewerId: 7,
    operation: 'emulator.sdk-set',
    path: '/private-sdk-path-canary'
  })
  expect(result).toMatchObject({ applied: true, persisted: true, state: { sdkPathSet: true } })
  expect(JSON.stringify(result)).not.toContain('private-sdk-path-canary')
  expect(JSON.stringify(result)).not.toContain('private-device-name-canary')
  expect(write).toHaveBeenCalledExactlyOnceWith({ androidSdkPath: '/private-sdk-path-canary' })
  expect(owners.availability).toHaveBeenLastCalledWith(
    { kind: 'local' },
    'emulator.availability',
    {}
  )
  expect(owners.availability).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull())
  expect(persisted.androidSdkPath).toBeNull()
})
it('pairs native picker completion with typed clear, and preserves cancellation and picker failure', async () => {
  await mount()
  owners.picker.mockResolvedValueOnce('/picked-sdk-path-canary')
  fireEvent.click(screen.getByRole('button', { name: 'Locate SDK folder' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument())
  expect(write).toHaveBeenCalledExactlyOnceWith({ androidSdkPath: '/picked-sdk-path-canary' })
  expect(await invoke({ viewerId: 7, operation: 'emulator.sdk-clear' })).toMatchObject({
    applied: true,
    persisted: true,
    state: { sdkPathSet: false }
  })
  expect(await invoke({ viewerId: 7, operation: 'emulator.sdk-locate' })).toMatchObject({
    applied: false,
    persisted: false
  })
  owners.picker.mockRejectedValueOnce(new Error('private-picker-error-canary'))
  const failed = await invoke({ viewerId: 7, operation: 'emulator.sdk-locate' })
  expect(failed.applied).toBe(false)
  expect(JSON.stringify(failed)).not.toContain('private-picker-error-canary')
  expect(document.body.textContent).not.toContain('private-picker-error-canary')
})
it('does not acknowledge failed settings or unavailable devices and reuses the native refresh owner', async () => {
  await mount()
  applyWrites = false
  expect(
    await invoke({ viewerId: 7, operation: 'emulator.sdk-set', path: '/unapplied-sdk' })
  ).toMatchObject({ applied: false, persisted: false, state: { sdkPathSet: false } })
  expect(await invoke({ viewerId: 7, operation: 'emulator.enabled', value: false })).toMatchObject({
    applied: false,
    persisted: false,
    state: { enabled: true }
  })
  expect(
    await invoke({ viewerId: 7, operation: 'emulator.default-device', deviceId: 'unknown-device' })
  ).toMatchObject({ applied: false, persisted: false })
  applyWrites = true
  expect(
    await invoke({ viewerId: 7, operation: 'emulator.default-device', deviceId: 'device-a' })
  ).toMatchObject({ applied: true, persisted: true, state: { defaultDeviceSet: true } })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh emulator availability' }))
  await waitFor(() => expect(owners.availability).toHaveBeenCalledTimes(3))
  expect(await invoke({ viewerId: 7, operation: 'emulator.refresh' })).toMatchObject({
    applied: true,
    persisted: null
  })
  expect(owners.availability).toHaveBeenCalledTimes(4)
})
it('shares picker and settings guards, refuses a chooser completion after unmount and contains external-open failure', async () => {
  await mount()
  let finish: ((path: string | null) => void) | undefined
  owners.picker.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Locate SDK folder' }))
  expect(await invoke({ viewerId: 7, operation: 'emulator.sdk-locate' })).toMatchObject({
    applied: false,
    persisted: false
  })
  expect(owners.picker).toHaveBeenCalledOnce()
  cleanup()
  await act(async () => {
    finish?.('/stale-picker-path')
  })
  expect(write).not.toHaveBeenCalled()
  await mount()
  expect(await invoke({ viewerId: 7, operation: 'emulator.studio-open' })).toMatchObject({
    applied: true,
    persisted: null
  })
  expect(owners.open).toHaveBeenCalledExactlyOnceWith('https://developer.android.com/studio')
  owners.open.mockRejectedValueOnce(new Error('private-open-canary'))
  expect(await invoke({ viewerId: 7, operation: 'emulator.studio-open' })).toMatchObject({
    applied: false,
    persisted: null
  })
})

it('pairs native enable and device controls with the typed setting owner', async () => {
  await mount()
  fireEvent.click(screen.getByRole('switch'))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Locate SDK folder' })).toBeNull()
  )
  expect(persisted.mobileEmulatorEnabled).toBe(false)
  expect(await invoke({ viewerId: 7, operation: 'emulator.enabled', value: true })).toMatchObject({
    applied: true,
    persisted: true
  })
  fireEvent.click(screen.getByRole('combobox'))
  await waitFor(() =>
    expect(screen.getByRole('option', { name: /private-device-name-canary/ })).toBeInTheDocument()
  )
  fireEvent.click(screen.getByRole('option', { name: /private-device-name-canary/ }))
  await waitFor(() => expect(persisted.mobileEmulatorDefaultDeviceUdid).toBe('device-a'))
  expect(
    await invoke({ viewerId: 7, operation: 'emulator.default-device', deviceId: null })
  ).toMatchObject({ applied: true, persisted: true, state: { defaultDeviceSet: false } })
})

it('waits for the exact chosen path to commit without exposing it in the acknowledgement', async () => {
  await mount()
  let commit: (() => void) | undefined
  write.mockImplementationOnce(async (updates) => {
    persisted = { ...persisted, ...updates }
    commit = () => useAppStore.setState({ settings: persisted })
  })
  owners.picker.mockResolvedValueOnce('/deferred-private-sdk-canary')
  let pending: ReturnType<typeof applyEmulatorSettingsViewerRequest> | undefined
  let settled = false
  await act(async () => {
    pending = applyEmulatorSettingsViewerRequest({
      id: 'deferred-picker',
      expiresAt: Date.now() + 500,
      command: { viewerId: 7, operation: 'emulator.sdk-locate' }
    })
    void pending.then(() => {
      settled = true
    })
  })
  await waitFor(() => expect(write).toHaveBeenCalledOnce())
  expect(settled).toBe(false)
  await act(async () => {
    commit?.()
  })
  await expect(pending).resolves.toMatchObject({
    applied: true,
    persisted: true,
    state: { sdkPathSet: true }
  })
  expect(JSON.stringify(await pending)).not.toContain('deferred-private-sdk-canary')
})
it('ignores a chooser selection after the typed request expires before starting a settings write', async () => {
  await mount()
  let choose: ((path: string) => void) | undefined
  owners.picker.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        choose = resolve
      })
  )
  const pending = applyEmulatorSettingsViewerRequest({
    id: 'expired-picker',
    expiresAt: Date.now() + 20,
    command: { viewerId: 7, operation: 'emulator.sdk-locate' }
  })
  void pending.catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 30))
  await act(async () => {
    choose?.('/expired-sdk-canary')
  })
  await expect(pending).rejects.toThrow('request_expired')
  expect(write).not.toHaveBeenCalled()
})
it('preserves a newer SDK setting when an older native chooser finishes', async () => {
  await mount()
  let choose: ((path: string) => void) | undefined
  owners.picker.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        choose = resolve
      })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Locate SDK folder' }))
  await expect(
    invoke({ viewerId: 7, operation: 'emulator.sdk-set', path: '/new-sdk-canary' })
  ).resolves.toMatchObject({ applied: true })
  await act(async () => {
    choose?.('/old-sdk-canary')
  })
  expect(write).toHaveBeenCalledTimes(1)
  expect(persisted.androidSdkPath).toBe('/new-sdk-canary')
})
it('returns the committed availability from the completed refresh rather than the previous result', async () => {
  await mount()
  owners.availability.mockResolvedValueOnce({ ...availability, available: false, devices: [] })
  await expect(invoke({ viewerId: 7, operation: 'emulator.refresh' })).resolves.toMatchObject({
    applied: true,
    persisted: null,
    state: { available: false, deviceCount: 0, refreshing: false }
  })
})

it('keeps a newer canonical SDK path from another settings writer while a native chooser is pending', async () => {
  await mount()
  let choose: ((path: string) => void) | undefined
  owners.picker.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        choose = resolve
      })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Locate SDK folder' }))
  await act(async () => {
    persisted = { ...persisted, androidSdkPath: '/canonical-other-window-sdk' }
    useAppStore.setState({ settings: persisted })
  })
  await act(async () => {
    choose?.('/stale-picker-sdk')
  })
  expect(write).not.toHaveBeenCalled()
  expect(persisted.androidSdkPath).toBe('/canonical-other-window-sdk')
})

it('pairs native example copy with the typed callback and contains clipboard failure', async () => {
  await mount()
  render(<MobileEmulatorExamples />)
  const clipboard = vi.fn().mockResolvedValue(undefined)
  window.api.ui = { ...window.api.ui, writeClipboardText: clipboard }
  fireEvent.click(screen.getAllByRole('button', { name: 'Copy example prompt' })[1])
  await waitFor(() => expect(clipboard).toHaveBeenCalledOnce())
  const nativePrompt = clipboard.mock.calls[0]?.[0]
  await expect(
    invoke({ viewerId: 7, operation: 'emulator.example-copy', exampleIndex: 1 })
  ).resolves.toMatchObject({ applied: true, persisted: null })
  expect(clipboard).toHaveBeenLastCalledWith(nativePrompt)
  clipboard.mockRejectedValueOnce(new Error('clipboard-private-canary'))
  const result = await invoke({ viewerId: 7, operation: 'emulator.example-copy', exampleIndex: 0 })
  expect(result.applied).toBe(false)
  expect(JSON.stringify(result)).not.toContain('clipboard-private-canary')
  expect(JSON.stringify(result)).not.toContain(nativePrompt)
})
