// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import { MobileEmulatorSettingsPane } from './MobileEmulatorSettingsPane'
import { applyEmulatorSettingsViewerRequest } from '@/runtime/emulator-settings-viewer'
const provider = vi.hoisted(() => ({ scan: vi.fn(), publish: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn(async () => ({
    platform: '',
    available: false,
    devices: [],
    simctl: { ok: false },
    serveSim: { ok: false },
    android: { sdkFound: false, message: '' },
    message: ''
  }))
}))
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    canUseLocalSkillFreshness: false,
    terminalShellOverride: undefined
  })
}))
vi.mock('@/hooks/useInstalledAgentSkills', async () => {
  const { useState } = await import('react')
  return {
    GLOBAL_AGENT_SKILL_SOURCE_KINDS: ['home'],
    notifyInstalledAgentSkillsRefreshed: provider.publish,
    useInstalledAgentSkill: () => {
      const [installed, setInstalled] = useState(false)
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState<string | null>(null)
      return {
        installed,
        loading,
        error,
        refresh: async () => {
          setLoading(true)
          try {
            const value: boolean = await provider.scan()
            setInstalled(value)
            setError(null)
            return value
          } catch {
            setError('private-scan-canary')
            return false
          } finally {
            setLoading(false)
          }
        }
      }
    }
  }
})
async function invoke() {
  let pending: ReturnType<typeof applyEmulatorSettingsViewerRequest> | undefined
  await act(async () => {
    pending = applyEmulatorSettingsViewerRequest({
      id: 'skill',
      expiresAt: Date.now() + 300,
      command: { viewerId: 7, operation: 'emulator.skill-refresh' }
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
beforeEach(async () => {
  vi.clearAllMocks()
  provider.scan.mockResolvedValue(false)
  useAppStore.setState(useAppStore.getInitialState(), true)
  const settings = getDefaultSettings('/fixture')
  useAppStore.setState({ settings })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { settings: { get: vi.fn(async () => settings) } }
  })
  render(<MobileEmulatorSettingsPane settings={settings} updateSettings={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Re-check' })).toBeInTheDocument())
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('pairs the native recheck with the typed owner and commits installed and uninstalled readiness', async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
  await waitFor(() => expect(provider.scan).toHaveBeenCalledOnce())
  await waitFor(() => expect(provider.publish).toHaveBeenCalledOnce())
  provider.scan.mockResolvedValueOnce(true)
  await expect(invoke()).resolves.toMatchObject({
    applied: true,
    persisted: null,
    state: { skillReady: true }
  })
  await expect(invoke()).resolves.toMatchObject({
    applied: true,
    persisted: null,
    state: { skillReady: false }
  })
  expect(provider.scan).toHaveBeenCalledTimes(3)
  expect(provider.publish).toHaveBeenCalledTimes(3)
})
it('shares the native and typed synchronous guard without starting another scan', async () => {
  let finish: ((installed: boolean) => void) | undefined
  provider.scan.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
  await expect(invoke()).resolves.toMatchObject({ applied: false })
  expect(provider.scan).toHaveBeenCalledOnce()
  await act(async () => {
    finish?.(true)
  })
})
it('rejects a scan error without returning provider text', async () => {
  provider.scan.mockRejectedValueOnce(new Error('private-provider-canary'))
  await expect(invoke()).rejects.toThrow('request_expired')
})
it('does not acknowledge a late scan after the settings surface unmounts', async () => {
  let finish: ((installed: boolean) => void) | undefined
  provider.scan.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  )
  const pending = invoke()
  void pending.catch(() => {})
  await waitFor(() => expect(provider.scan).toHaveBeenCalledOnce())
  await act(async () => {
    cleanup()
    finish?.(true)
  })
  await expect(pending).rejects.toThrow('request_expired')
})
