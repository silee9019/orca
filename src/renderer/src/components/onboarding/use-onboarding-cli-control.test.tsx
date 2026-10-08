// @vitest-environment happy-dom
import { useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AppSurfaceAction, AppSurfaceRequest } from '../../../../shared/app-surface-control'
import { registerAppSurfaceIpcBridge } from '../../hooks/ipc-events/app-surface-ipc-bridge'
import { useOnboardingCliControl } from './use-onboarding-cli-control'
import { STEPS } from './use-onboarding-flow-types'
vi.mock('@/lib/agent-catalog', () => ({ getAgentCatalog: () => [{ id: 'codex' }] }))
afterEach(() => {
  delete window.orcaAppSurface
})
it('uses the current onboarding callback and explicit skip confirmation without skipping busy guards', async () => {
  let receive: ((request: AppSurfaceRequest) => void) | undefined
  const reply = vi.fn()
  window.orcaAppSurface = {
    onRequest: (callback) => {
      receive = callback
      return () => {}
    },
    reply
  }
  const persist = vi.fn(async () => {})
  const dismiss = vi.fn(async () => true)
  const next = vi.fn(async () => {})
  let busy: string | null = null
  const hook = renderHook(() => {
    const [theme, setTheme] = useState<'system' | 'dark' | 'light'>('dark')
    const [skipOpen, setSkipOpen] = useState(false)
    useOnboardingCliControl(
      {
        stepIndex: 0,
        currentStep: STEPS[0],
        progressSteps: STEPS.map((step, index) => ({ step, index })),
        busyLabel: busy,
        selectedAgent: null,
        theme,
        setTheme,
        updateSettings: persist,
        dismissOnboarding: dismiss,
        next,
        back: vi.fn(),
        jumpToStep: vi.fn(),
        setSelectedAgent: vi.fn()
      },
      skipOpen,
      setSkipOpen
    )
    return { theme, skipOpen }
  })
  const cleanup = registerAppSurfaceIpcBridge()
  async function send(action: AppSurfaceAction): Promise<void> {
    reply.mockClear()
    await act(async () => receive?.({ requestId: 'c8d153e4-ef16-4da8-b972-2fd3cecb378b', action }))
    await waitFor(() => expect(reply).toHaveBeenCalledOnce())
  }
  try {
    await send({ kind: 'onboarding', action: 'theme', theme: 'light' })
    expect(hook.result.current.theme).toBe('light')
    expect(persist).toHaveBeenCalledWith({ theme: 'light' })
    await send({ kind: 'onboarding', action: 'confirm-skip' })
    expect(reply.mock.lastCall?.[0]).toMatchObject({ ok: false })
    expect(dismiss).not.toHaveBeenCalled()
    await send({ kind: 'onboarding', action: 'request-skip' })
    expect(hook.result.current.skipOpen).toBe(true)
    await send({ kind: 'onboarding', action: 'confirm-skip' })
    expect(dismiss).toHaveBeenCalledWith('button')
    expect(hook.result.current.skipOpen).toBe(false)
    busy = 'saving'
    hook.rerender()
    await send({ kind: 'onboarding', action: 'next' })
    expect(reply.mock.lastCall?.[0]).toMatchObject({ ok: false })
    expect(next).not.toHaveBeenCalled()
  } finally {
    hook.unmount()
    cleanup()
  }
})
