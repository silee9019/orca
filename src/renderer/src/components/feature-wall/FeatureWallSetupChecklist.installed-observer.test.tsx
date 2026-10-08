// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type * as CapabilityStatus from './agent-capability-setup-status'
import { useAppStore } from '@/store'
import { SettingsSetupGuidePane } from '../settings/SettingsSetupGuidePane'
import SetupGuideModal from '../setup-guide/SetupGuideModal'
import { TooltipProvider } from '../ui/tooltip'

const source = vi.hoisted(() => ({
  browser: false,
  orchestration: false,
  progressInputs: vi.fn(),
  progress: {
    ready: true,
    coreDoneCount: 5,
    coreTotal: 6,
    stepDone: {
      'default-agent': true,
      'add-two-repos': true,
      notifications: true,
      'two-worktrees': true,
      browser: true,
      'task-sources': true,
      'agent-capabilities': false,
      'setup-script': true
    }
  }
}))
vi.mock('./agent-capability-setup-status', async (original) => {
  const actual = await original<typeof CapabilityStatus>()
  return {
    ...actual,
    useAgentCapabilitySetupStatus: () => ({
      readiness: {
        browserUseSkillInstalled: source.browser,
        browserUseSkillLoading: false,
        orchestrationSkillInstalled: source.orchestration,
        orchestrationSkillLoading: false,
        computerUseSkillInstalled: false,
        computerUseSkillLoading: false,
        computerUseReady: false,
        computerUseChecking: false,
        computerUseUnavailable: true
      },
      installStatus: {
        browserUse: { label: 'Browser', tone: 'pending' },
        computerUse: { label: 'Computer', tone: 'unavailable' },
        orchestration: { label: 'Orchestration', tone: 'pending' },
        linearTickets: { label: '', tone: 'pending' }
      }
    })
  }
})
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({ agentRuntime: { runtime: 'host', label: 'Host' } })
}))
vi.mock('../settings/settings-setup-guide-progress', () => ({
  useSettingsSetupGuideFullProgress: (
    active: boolean,
    orchestration: boolean,
    browser: boolean
  ) => {
    source.progressInputs(active, orchestration, browser)
    return source.progress
  }
}))
vi.mock('../setup-guide/use-setup-guide-progress', () => ({
  useSetupGuideProgress: (active: boolean, orchestration: boolean, browser: boolean) => {
    source.progressInputs(active, orchestration, browser)
    return source.progress
  }
}))
vi.mock('../setup-guide/use-setup-guide-telemetry', () => ({
  useSetupGuideOpenCloseTelemetry: () => undefined
}))
beforeEach(() => {
  source.browser = false
  source.orchestration = false
  source.progressInputs.mockClear()
  useAppStore.setState({
    activeModal: 'setup-guide',
    modalData: { setupStepId: 'agent-capabilities' }
  })
})
afterEach(cleanup)
it.each(['settings', 'modal'])(
  'forwards observed installed and removed skills through the actual %s parent',
  async (surface) => {
    const content = () => (
      <TooltipProvider>
        {surface === 'settings' ? <SettingsSetupGuidePane /> : <SetupGuideModal />}
      </TooltipProvider>
    )
    const view = render(content())
    expect(source.progressInputs).toHaveBeenLastCalledWith(true, false, false)
    source.orchestration = true
    view.rerender(content())
    await waitFor(() => expect(source.progressInputs).toHaveBeenLastCalledWith(true, true, false))
    source.browser = true
    view.rerender(content())
    await waitFor(() => expect(source.progressInputs).toHaveBeenLastCalledWith(true, true, true))
    source.orchestration = false
    view.rerender(content())
    await waitFor(() => expect(source.progressInputs).toHaveBeenLastCalledWith(true, false, true))
    view.unmount()
    const before = source.progressInputs.mock.calls.length
    source.browser = false
    await act(async () => undefined)
    expect(source.progressInputs).toHaveBeenCalledTimes(before)
  }
)
