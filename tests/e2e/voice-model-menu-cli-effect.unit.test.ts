// @vitest-environment happy-dom
import { voiceModelMenuOwnerFixture } from './voice-model-menu-owner.fixture'
import { useAppStore } from '../../src/renderer/src/store'
import {
  VOICE_MODEL_MENU_EVENT,
  requestVoiceModelMenu
} from '../../src/renderer/src/runtime/voice-model-menu-request'
import { act, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

let fixture: Awaited<ReturnType<typeof voiceModelMenuOwnerFixture>> | undefined
afterEach(async () => {
  await fixture?.close()
  fixture = undefined
  vi.restoreAllMocks()
})
it('opens, reads and closes the actual mounted speech model menu over the existing voice socket', async () => {
  fixture = await voiceModelMenuOwnerFixture()
  await fixture.invoke('model-menu-open')
  expect(document.querySelector('[role="menu"]')).not.toBeNull()
  await fixture.invoke('model-menu-status')
  expect(fixture.output.mock.calls.flat().join(' ')).toContain('"modelMenuOpen": true')
  await fixture.invoke('model-menu-close')
  expect(document.querySelector('[role="menu"]')).toBeNull()
  expect(fixture.refresh).not.toHaveBeenCalled()
})

it('refuses disabled, ambiguous and missing model menu owners before opening', async () => {
  fixture = await voiceModelMenuOwnerFixture()
  await act(async () => {
    const settings = useAppStore.getState().settings
    if (!settings) {
      throw new Error('settings missing')
    }
    useAppStore.setState({
      settings: { ...settings, voice: { ...settings.voice, enabled: false } }
    })
  })
  await expect(fixture.invoke('model-menu-open')).rejects.toThrow('voice_model_menu_unavailable')
  expect(document.querySelector('[role="menu"]')).toBeNull()
  await fixture.render(2)
  await expect(fixture.invoke('model-menu-open')).rejects.toThrow('owner_ambiguous')
  await fixture.render(0)
  await expect(fixture.invoke('model-menu-open')).rejects.toThrow('owner_unavailable')
  expect(fixture.refresh).not.toHaveBeenCalled()
})

it('refuses a busy modal and remote runtime before the existing setter', async () => {
  fixture = await voiceModelMenuOwnerFixture()
  await act(async () => useAppStore.setState({ activeModal: 'feature-tips' }))
  await expect(fixture.invoke('model-menu-open')).rejects.toThrow('voice_model_menu_unavailable')
  await act(async () => {
    const settings = useAppStore.getState().settings
    if (!settings) {
      throw new Error('settings missing')
    }
    useAppStore.setState({
      activeModal: 'none',
      settings: { ...settings, activeRuntimeEnvironmentId: 'remote' }
    })
  })
  await expect(fixture.invoke('model-menu-open')).rejects.toThrow('viewer_runtime_mismatch')
  expect(document.querySelector('[role="menu"]')).toBeNull()
  await act(async () => {
    const settings = useAppStore.getState().settings
    if (!settings) {
      throw new Error('settings missing')
    }
    useAppStore.setState({ settings: { ...settings, activeRuntimeEnvironmentId: null } })
  })
  Object.defineProperty(globalThis, '__ORCA_WEB_CLIENT__', { configurable: true, value: true })
  try {
    await expect(fixture.invoke('model-menu-open')).rejects.toThrow('voice_model_menu_unavailable')
  } finally {
    Reflect.deleteProperty(globalThis, '__ORCA_WEB_CLIENT__')
  }
  expect(document.querySelector('[role="menu"]')).toBeNull()
})

it('reads the committed original UI menu and overrides an opening UI action before commit', async () => {
  fixture = await voiceModelMenuOwnerFixture()
  const trigger = document.querySelector('button')
  if (!trigger) {
    throw new Error('model trigger missing')
  }
  await act(async () => fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false }))
  expect(document.querySelector('[role="menu"]')).not.toBeNull()
  await fixture.invoke('model-menu-status')
  expect(JSON.parse(String(fixture.output.mock.calls.at(-1)?.[0])).result.modelMenuOpen).toBe(true)
  await fixture.invoke('model-menu-close')
  let pending: Promise<boolean> | undefined
  await act(async () => {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    pending = requestVoiceModelMenu('close', Date.now() + 1000)
    void pending.catch(() => {})
  })
  await expect(pending).resolves.toBe(false)
  expect(document.querySelector('[role="menu"]')).toBeNull()
})

it('invalidates an in-flight request on Store surface ABA and refuses expired requests', async () => {
  fixture = await voiceModelMenuOwnerFixture()
  let pending: Promise<boolean> | undefined
  await act(async () => {
    pending = requestVoiceModelMenu('open', Date.now() + 1000)
    void pending.catch(() => {})
    useAppStore.setState({ activeView: 'terminal' })
    useAppStore.setState({ activeView: 'settings' })
  })
  await expect(pending).rejects.toThrow('changed_effect_unknown')
  await fixture.invoke('model-menu-close')
  await expect(requestVoiceModelMenu('open', Date.now() - 1)).rejects.toThrow('request_expired')
  expect(document.querySelector('[role="menu"]')).toBeNull()
})

it('rejects Store surface ABA between dispatch offer and effect before opening', async () => {
  fixture = await voiceModelMenuOwnerFixture()
  const dispatch = window.dispatchEvent.bind(window)
  vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
    const result = dispatch(event)
    if (event.type === VOICE_MODEL_MENU_EVENT) {
      useAppStore.setState({ activeView: 'terminal' })
      useAppStore.setState({ activeView: 'settings' })
    }
    return result
  })
  await expect(fixture.invoke('model-menu-open')).rejects.toThrow('voice_model_menu_unavailable')
  expect(document.querySelector('[role="menu"]')).toBeNull()
})
