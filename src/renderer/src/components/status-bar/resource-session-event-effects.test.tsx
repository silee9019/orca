// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { SessionRow } from './resource-usage-session-rows'
vi.mock('./resource-usage-metrics', () => ({
  MetricPair: () => null,
  ROW_TRAILING_GUTTER_CLS: '',
  Sparkline: () => null
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
it('keeps kill preparation from navigating and prevents keyboard activation defaults while navigating once', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const navigate = vi.fn()
  const kill = vi.fn()
  const session = {
    sessionId: 'fixture-session',
    pid: 123,
    tabId: 'fixture-tab',
    paneKey: 'fixture-leaf',
    bound: true,
    agentOwnership: 'unknown' as const,
    label: 'fixture',
    cpu: null,
    memory: null,
    hasLocalSamples: false
  }
  try {
    await act(async () =>
      root.render(
        <SessionRow
          session={session}
          worktreeId="folder:fixture"
          onNavigate={navigate}
          onKill={kill}
        />
      )
    )
    const button = container.querySelector('button')
    const row = container.querySelector('[role="button"]')
    if (!button || !row) {
      throw new Error('missing session controls')
    }
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(kill).toHaveBeenCalledExactlyOnceWith(session)
    expect(navigate).not.toHaveBeenCalled()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => {
      row.dispatchEvent(enter)
    })
    expect(enter.defaultPrevented).toBe(true)
    expect(navigate).toHaveBeenCalledExactlyOnceWith('fixture-tab', 'fixture-leaf')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
