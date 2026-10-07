// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  _installedAgentSkillDiscoveryInternalsForTests,
  useInstalledAgentSkill,
  type InstalledAgentSkillState
} from './useInstalledAgentSkills'
import type { SkillDiscoveryResult } from '../../../shared/skills'

it('ties refresh receipt to the committed current scan rather than Promise completion', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const result: SkillDiscoveryResult = { skills: [], sources: [], scannedAt: 1 }
  const discover = vi.fn(async () => ({ ...result, scannedAt: Date.now() }))
  Object.assign(window, { api: { skills: { discover } } })
  useAppStore.setState({
    settings: null,
    runtimeEnvironments: [],
    runtimeEnvironmentCatalogSettled: true
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let latest: InstalledAgentSkillState | undefined
  function Probe(): null {
    latest = useInstalledAgentSkill('orca-cli')
    return null
  }
  try {
    await act(async () => root.render(createElement(Probe)))
    if (!latest?.refreshWithReceipt) {
      throw new Error('refresh receipt owner unavailable')
    }
    let receipt: (() => boolean) | undefined
    await act(async () => {
      receipt = await latest?.refreshWithReceipt?.()
      expect(receipt?.()).toBe(false)
    })
    expect(receipt?.()).toBe(true)
    let release = (): void => {}
    discover.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return result
    })
    let refresh: Promise<boolean> | undefined
    await act(async () => {
      refresh = latest?.refresh()
      expect(receipt?.()).toBe(false)
    })
    await act(async () => {
      release()
      await refresh
    })
    discover.mockRejectedValueOnce(new Error('private-discovery-error'))
    await act(async () => {
      expect(await latest?.refreshWithReceipt?.()).toBeUndefined()
    })
    await act(async () => root.unmount())
    expect(receipt?.()).toBe(false)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    _installedAgentSkillDiscoveryInternalsForTests.reset()
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'api')
  }
})
