import { afterEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../shared/constants'
import { useAppStore } from '../../index'

afterEach(() => vi.unstubAllGlobals())

it('does not replace newer settings when a card preset response arrives late', async () => {
  const initial = getDefaultSettings('/fixture')
  const response = Promise.withResolvers<typeof initial>()
  const saveSettings = vi.fn(() => response.promise)
  const saveUI = vi.fn(async () => {})
  vi.stubGlobal('window', { api: { settings: { set: saveSettings }, ui: { set: saveUI } } })
  useAppStore.setState({ settings: initial })

  useAppStore.getState().setWorktreeCardMode('Compact')
  const newer = {
    ...initial,
    compactWorktreeCards: false,
    activeRuntimeEnvironmentId: 'another-host'
  }
  useAppStore.setState({ settings: newer })
  response.resolve({ ...initial, compactWorktreeCards: true })
  await response.promise
  await Promise.resolve()

  expect(useAppStore.getState().settings).toBe(newer)
  expect(saveSettings).toHaveBeenCalledWith({ compactWorktreeCards: true })
  expect(saveUI).toHaveBeenCalledWith({
    worktreeCardProperties: ['status'],
    _worktreeCardModeDefaulted: true
  })
})

it('exposes a rejected preset write to an awaiting command', async () => {
  const failure = new Error('write_rejected')
  vi.stubGlobal('window', {
    api: {
      settings: { set: vi.fn(async () => getDefaultSettings('/fixture')) },
      ui: {
        set: vi.fn(async () => {}),
        setWithAck: vi.fn(async () => {
          throw failure
        })
      }
    }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(useAppStore.getState().setWorktreeCardMode('Default')).rejects.toBe(failure)
  vi.restoreAllMocks()
})
