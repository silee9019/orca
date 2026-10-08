// @vitest-environment happy-dom
import { act, useCallback, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  LinearAgentSkillSetupPrompt,
  _linearAgentSkillSetupPromptInternalsForTests
} from './LinearAgentSkillSetupPrompt'
import { applySkillsViewerRequest as apply } from '@/runtime/skills-viewer-request'
import { useAppStore } from '@/store'
import { getExistingLinearAgentSkillSetupReminderState } from './linear-agent-skill-setup-reminders'

const provider = vi.hoisted(() => {
  const state: { error: string | null } = { error: null }
  return { refresh: vi.fn(), surfaces: vi.fn(), discovery: vi.fn(), state }
})
let finish: (() => void) | undefined
vi.mock('@/hooks/useInstalledAgentSkills', () => {
  function useDiscovery(...args: unknown[]) {
    provider.discovery(...args)
    const [installed, setInstalled] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const refresh = useCallback(async () => {
      provider.refresh()
      setError(provider.state.error)
      setInstalled(provider.state.error === null)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    }, [])
    return { installed, loading: false, error, skills: [], sources: [], refresh }
  }
  return {
    GLOBAL_AGENT_SKILL_SOURCE_KINDS: ['home'],
    hasInstalledAgentSkill: () => false,
    notifyInstalledAgentSkillsRefreshed: provider.surfaces,
    useInstalledAgentSkillNames: useDiscovery
  }
})
vi.mock('../skills/SkillFreshnessStatusPill', () => ({ SkillFreshnessStatusPill: () => null }))
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
beforeEach(() => {
  provider.refresh.mockReset()
  provider.discovery.mockReset()
  provider.surfaces.mockReset()
  provider.state.error = null
  finish = undefined
  localStorage.clear()
  _linearAgentSkillSetupPromptInternalsForTests.resetSessionReminders()
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { platform: { get: () => ({ platform: 'linux' }) } }
  })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  _linearAgentSkillSetupPromptInternalsForTests.resetSessionReminders()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
async function panel() {
  const result = await apply({ kind: 'setup-form', action: { kind: 'get' } })
  if (!('setupPanels' in result)) {
    throw new Error('missing parent panels')
  }
  const panel = result.setupPanels.find((entry) =>
    entry.panelKey.startsWith('sidebar-linear-prompt:')
  )
  if (!panel) {
    throw new Error('missing parent panel')
  }
  return panel
}
async function start() {
  const reviewed = await panel()
  const pending = apply({
    kind: 'setup-form',
    action: {
      kind: 'recheck',
      panelKey: reviewed.panelKey,
      reviewedTarget: reviewed.reviewedTarget
    }
  })
  void pending.catch(() => undefined)
  return { pending }
}
it.each(['inline', 'modal'] as const)(
  'accepts its own %s discovery update through native and CLI',
  async (surface) => {
    for (const mode of ['native', 'cli']) {
      const view = render(
        <LinearAgentSkillSetupPrompt
          linked
          remote={false}
          surface={surface}
          currentPlatform="linux"
        />
      )
      if (surface === 'modal') {
        await import('./LinearAgentSkillSetupDialog')
        await act(async () => undefined)
      }
      const button = await screen.findByRole('button', { name: 'Re-check' })
      let pending: ReturnType<typeof apply> | undefined
      if (mode === 'native') {
        fireEvent.click(button)
      } else {
        ;({ pending } = await start())
      }
      await waitFor(() => expect(provider.refresh).toHaveBeenCalledTimes(mode === 'native' ? 1 : 2))
      if (surface === 'modal') {
        await screen.findByRole('button', { name: 'Done' })
      } else {
        expect(screen.queryByRole('button', { name: 'Re-check' })).toBeNull()
      }
      let complete = false
      void pending?.then(() => {
        complete = true
      })
      await act(async () => undefined)
      expect(complete).toBe(false)
      await act(async () => finish?.())
      if (pending) {
        await expect(pending).resolves.toMatchObject({
          setupPanels: [{ installed: true, loading: false, busy: false }]
        })
      }
      expect(provider.surfaces).toHaveBeenCalledTimes(
        surface === 'modal' ? (mode === 'native' ? 1 : 2) : 0
      )
      view.unmount()
      _linearAgentSkillSetupPromptInternalsForTests.resetSessionReminders()
    }
  }
)
it.each(['profile', 'modal', 'runtime', 'unmount'] as const)(
  'rejects pending parent recheck across %s',
  async (change) => {
    const view = render(
      <LinearAgentSkillSetupPrompt linked remote={false} currentPlatform="win32" />
    )
    await screen.findByRole('button', { name: 'Re-check' })
    const { pending } = await start()
    await waitFor(() => expect(provider.refresh).toHaveBeenCalledOnce())
    if (change === 'profile') {
      act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
      act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
    }
    if (change === 'modal') {
      act(() => useAppStore.setState({ activeModal: 'add-repo' }))
      act(() => useAppStore.setState({ activeModal: 'none' }))
    }
    if (change === 'runtime') {
      view.rerender(
        <LinearAgentSkillSetupPrompt
          linked
          remote={false}
          currentPlatform="win32"
          settings={{
            localAgentRuntime: 'wsl',
            localAgentWslDistro: 'Ubuntu',
            terminalWindowsShell: 'wsl.exe',
            activeRuntimeEnvironmentId: null
          }}
        />
      )
      view.rerender(<LinearAgentSkillSetupPrompt linked remote={false} currentPlatform="win32" />)
    }
    if (change === 'unmount') {
      view.unmount()
    }
    await expect(pending).rejects.toThrow(/viewer_target_changed|viewer_unmounted/)
    await act(async () => finish?.())
  }
)

it('reports failed discovery, keeps the inline retry available, and completes its retry', async () => {
  provider.state.error = 'discovery failed'
  render(<LinearAgentSkillSetupPrompt linked remote={false} currentPlatform="linux" />)
  const first = await start()
  await waitFor(() => expect(provider.refresh).toHaveBeenCalledOnce())
  await expect((await start()).pending).rejects.toThrow('viewer_busy')
  await act(async () => finish?.())
  await expect(first.pending).resolves.toMatchObject({
    setupPanels: [{ installed: false, error: 'discovery failed', canRecheck: true }]
  })
  provider.state.error = null
  const second = await start()
  await waitFor(() => expect(provider.refresh).toHaveBeenCalledTimes(2))
  await act(async () => finish?.())
  await expect(second.pending).resolves.toMatchObject({
    setupPanels: [{ installed: true, error: null }]
  })
  expect(provider.surfaces).not.toHaveBeenCalled()
})
it('rejects a pending modal recheck when the user closes the success dialog', async () => {
  render(
    <LinearAgentSkillSetupPrompt linked remote={false} surface="modal" currentPlatform="linux" />
  )
  await import('./LinearAgentSkillSetupDialog')
  await screen.findByRole('button', { name: 'Re-check' })
  const { pending } = await start()
  const done = await screen.findByRole('button', { name: 'Done' })
  fireEvent.click(done)
  await expect(pending).rejects.toThrow('viewer_target_changed')
  await act(async () => finish?.())
  expect(provider.refresh).toHaveBeenCalledOnce()
})
it('preserves the selected WSL discovery owner and blocks hidden/unlinked prompts', async () => {
  const view = render(
    <LinearAgentSkillSetupPrompt linked={false} remote={false} currentPlatform="win32" />
  )
  await expect((await start()).pending).rejects.toThrow('skill_setup_recheck_unavailable')
  expect(provider.refresh).not.toHaveBeenCalled()
  view.rerender(
    <LinearAgentSkillSetupPrompt
      linked
      remote={false}
      currentPlatform="win32"
      settings={{
        localAgentRuntime: 'wsl',
        localAgentWslDistro: 'Ubuntu',
        terminalWindowsShell: 'wsl.exe',
        activeRuntimeEnvironmentId: null
      }}
    />
  )
  const { pending } = await start()
  await waitFor(() => expect(provider.refresh).toHaveBeenCalledOnce())
  expect(provider.discovery).toHaveBeenLastCalledWith(expect.any(Array), {
    enabled: true,
    discoveryTarget: { runtime: 'wsl', wslDistro: 'Ubuntu' },
    sourceKinds: ['home']
  })
  await act(async () => finish?.())
  await expect(pending).resolves.toMatchObject({ setupPanels: [{ installed: true }] })
})

async function promptTarget() {
  const response = await apply({ kind: 'linear-prompt-form', action: { kind: 'get' } })
  if (!('linearPrompts' in response) || !response.linearPrompts[0]) {
    throw new Error('missing Linear prompt')
  }
  return response.linearPrompts[0]
}
async function runPrompt(kind: 'dismiss' | 'finish') {
  const target = await promptTarget()
  let pending: ReturnType<typeof apply> | undefined
  act(() => {
    pending = apply({
      kind: 'linear-prompt-form',
      action: { kind, promptKey: target.promptKey, reviewedTarget: target.reviewedTarget }
    })
    void pending.catch(() => undefined)
  })
  await act(async () => undefined)
  return pending
}
it.each(['inline', 'modal'] as const)(
  'permanently dismisses the actual %s prompt through native and CLI',
  async (surface) => {
    for (const mode of ['native', 'cli']) {
      const view = render(
        <LinearAgentSkillSetupPrompt
          linked
          remote={false}
          surface={surface}
          currentPlatform="linux"
        />
      )
      if (surface === 'modal') {
        await import('./LinearAgentSkillSetupDialog')
        await act(async () => undefined)
      }
      const button = await screen.findByRole('button', {
        name: surface === 'modal' ? "Don't show again" : 'Dismiss Linear agent skill setup'
      })
      if (mode === 'native') {
        fireEvent.click(button)
      } else {
        await runPrompt('dismiss')
      }
      expect(localStorage.getItem('orca.linearTicketsSkill.setupDismissed.host')).toBe('1')
      expect(screen.queryByRole('button', { name: 'Re-check' })).toBeNull()
      view.unmount()
      localStorage.clear()
      _linearAgentSkillSetupPromptInternalsForTests.resetSessionReminders()
    }
  }
)
it.each(['native', 'cli'])('finishes the actual success dialog through %s', async (mode) => {
  render(
    <LinearAgentSkillSetupPrompt linked remote={false} surface="modal" currentPlatform="linux" />
  )
  await import('./LinearAgentSkillSetupDialog')
  await screen.findByRole('button', { name: 'Re-check' })
  const { pending } = await start()
  await screen.findByRole('button', { name: 'Done' })
  await act(async () => finish?.())
  await pending
  if (mode === 'native') {
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  } else {
    await runPrompt('finish')
  }
  expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
  expect(localStorage.getItem('orca.linearTicketsSkill.setupDismissed.host')).toBeNull()
  expect(
    getExistingLinearAgentSkillSetupReminderState('orca.linearTicketsSkill.setupDismissed.host')
  ).toMatchObject({ modalShown: false, snoozed: false, toastCount: 0 })
})
it('persists only the reviewed WSL dismissal key and propagates storage failures', async () => {
  render(
    <LinearAgentSkillSetupPrompt
      linked
      remote={false}
      currentPlatform="win32"
      settings={{
        localAgentRuntime: 'wsl',
        localAgentWslDistro: 'Ubuntu',
        terminalWindowsShell: 'wsl.exe',
        activeRuntimeEnvironmentId: null
      }}
    />
  )
  const setItem = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
    throw new Error('storage denied')
  })
  try {
    await expect(runPrompt('dismiss')).rejects.toThrow('storage denied')
    expect(screen.getByRole('button', { name: 'Re-check' })).toBeTruthy()
    await runPrompt('dismiss')
    expect(localStorage.getItem('orca.linearTicketsSkill.setupDismissed.wsl.Ubuntu')).toBe('1')
    expect(localStorage.getItem('orca.linearTicketsSkill.setupDismissed.host')).toBeNull()
    expect(provider.refresh).not.toHaveBeenCalled()
  } finally {
    setItem.mockRestore()
  }
})
