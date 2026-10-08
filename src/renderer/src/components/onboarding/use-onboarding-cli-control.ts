import { useAppSurfaceControl } from '../../hooks/ipc-events/app-surface-ipc-bridge'
import { getAgentCatalog } from '@/lib/agent-catalog'
import type { useOnboardingFlow } from './use-onboarding-flow'

type Flow = Pick<
  ReturnType<typeof useOnboardingFlow>,
  | 'stepIndex'
  | 'currentStep'
  | 'busyLabel'
  | 'selectedAgent'
  | 'theme'
  | 'next'
  | 'back'
  | 'progressSteps'
  | 'jumpToStep'
  | 'setSelectedAgent'
  | 'setTheme'
  | 'updateSettings'
  | 'dismissOnboarding'
>
export function useOnboardingCliControl(
  flow: Flow,
  skipOpen: boolean,
  setSkipOpen: (open: boolean) => void
): void {
  useAppSurfaceControl('onboarding', async (input) => {
    if (input.kind !== 'onboarding') {
      return
    }
    if (input.action === 'status') {
      return {
        step: flow.stepIndex,
        stepId: flow.currentStep.id,
        busy: Boolean(flow.busyLabel),
        agent: flow.selectedAgent,
        theme: flow.theme,
        skipOpen
      }
    }
    if (skipOpen && input.action !== 'cancel-skip' && input.action !== 'confirm-skip') {
      throw new Error('Resolve the open skip confirmation first')
    }
    if (flow.busyLabel) {
      throw new Error('Onboarding is busy')
    }
    switch (input.action) {
      case 'next':
        await flow.next('button')
        break
      case 'back':
        flow.back()
        break
      case 'jump':
        if (
          input.step === undefined ||
          !flow.progressSteps.some((step) => step.index === input.step)
        ) {
          throw new Error('Specify an available step from onboarding status')
        }
        flow.jumpToStep(input.step)
        break
      case 'agent': {
        const agent = getAgentCatalog().find((agent) => agent.id === input.agent)
        if (!agent) {
          throw new Error('Unknown agent')
        }
        flow.setSelectedAgent(agent.id)
        break
      }
      case 'theme':
        if (!input.theme) {
          throw new Error('Specify theme')
        }
        flow.setTheme(input.theme)
        await flow.updateSettings({ theme: input.theme })
        break
      case 'request-skip':
        setSkipOpen(true)
        break
      case 'cancel-skip':
        setSkipOpen(false)
        break
      case 'confirm-skip':
        if (!skipOpen) {
          throw new Error('Request skip confirmation first')
        }
        if (!(await flow.dismissOnboarding('button'))) {
          throw new Error('Onboarding dismissal failed')
        }
        setSkipOpen(false)
        break
    }
    return { state: 'requested' }
  })
}
