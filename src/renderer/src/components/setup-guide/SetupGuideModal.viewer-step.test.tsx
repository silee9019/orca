// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  FeatureWallSetupStep,
  FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { FeatureWallSetupProgress } from '../feature-wall/feature-wall-setup-progress'
import { useAppStore } from '@/store'
import SetupGuideModal from './SetupGuideModal'

const progress: FeatureWallSetupProgress = {
  ready: true,
  stepDone: {
    'default-agent': false,
    'add-two-repos': false,
    notifications: true,
    'two-worktrees': false,
    browser: false,
    'task-sources': false,
    'agent-capabilities': false,
    'setup-script': false
  },
  coreDoneCount: 1,
  coreTotal: 8
}
vi.mock('./use-setup-guide-progress', () => ({
  useSetupGuideProgress: () => {
    useAppStore((state) => state.activeWorktreeId)
    return progress
  }
}))
vi.mock('./use-setup-guide-telemetry', () => ({ useSetupGuideOpenCloseTelemetry: () => {} }))
vi.mock('../feature-wall/FeatureWallSetupChecklist', () => ({
  FeatureWallSetupChecklist: ({
    activeStep,
    onSelectStep
  }: {
    activeStep: FeatureWallSetupStep | null
    onSelectStep: (id: FeatureWallSetupStepId) => void
  }) => (
    <div data-testid="content" data-step={activeStep?.id}>
      <button onClick={() => onSelectStep('default-agent')}>Select default agent</button>
      <button onClick={() => onSelectStep('browser')}>Select browser</button>
    </div>
  )
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <>{children}</> : null,
  DialogContent: (props: React.ComponentProps<'div'>) => <div {...props} />,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>
}))
const initial = useAppStore.getInitialState()
beforeEach(() => {
  vi.useFakeTimers()
  progress.stepDone['default-agent'] = false
  useAppStore.setState(initial, true)
  useAppStore.setState({ activeModal: 'setup-guide', modalData: { telemetrySource: 'help_menu' } })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.useRealTimers()
})
it('keeps same-step selection manual across progress updates and resets after close', async () => {
  render(<SetupGuideModal />)
  expect(screen.getByTestId('content').dataset.step).toBe('default-agent')
  act(() => screen.getByText('Select default agent').click())
  expect(
    document
      .querySelector('[data-setup-guide-selection-revision]')
      ?.getAttribute('data-setup-guide-selection-revision')
  ).toBe('1')
  act(() => {
    progress.stepDone['default-agent'] = true
    useAppStore.setState({ activeWorktreeId: 'synthetic-progress-change' })
  })
  expect(screen.getByTestId('content').dataset.step).toBe('default-agent')
  act(() => useAppStore.getState().closeModal())
  await act(async () => {
    await vi.advanceTimersByTimeAsync(301)
  })
  act(() => useAppStore.getState().openModal('setup-guide', { telemetrySource: 'help_menu' }))
  expect(screen.getByTestId('content').dataset.step).toBe('agent-capabilities')
})
it('increments the original callback revision for both another and the same target', () => {
  render(<SetupGuideModal />)
  act(() => screen.getByText('Select browser').click())
  act(() => screen.getByText('Select browser').click())
  expect(screen.getByTestId('content').dataset.step).toBe('browser')
  expect(
    document
      .querySelector('[data-setup-guide-selection-revision]')
      ?.getAttribute('data-setup-guide-selection-revision')
  ).toBe('2')
})

it('uses the original hide setter once while keeping the modal and selected step', () => {
  const hide = vi.fn()
  useAppStore.setState({ setSetupGuideSidebarDismissed: hide })
  render(<SetupGuideModal />)
  act(() => screen.getByText('Select browser').click())
  const modalData = useAppStore.getState().modalData
  const button = document.querySelector('[data-setup-guide-hide-sidebar="true"]')
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('missing original hide button')
  }
  act(() => button.click())
  expect(hide).toHaveBeenCalledExactlyOnceWith(true)
  expect(useAppStore.getState().activeModal).toBe('setup-guide')
  expect(useAppStore.getState().modalData).toBe(modalData)
  expect(screen.getByTestId('content').dataset.step).toBe('browser')
  expect(
    document
      .querySelector('[data-setup-guide-selection-revision]')
      ?.getAttribute('data-setup-guide-selection-revision')
  ).toBe('1')
})
