// @vitest-environment happy-dom
import { act, type ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentSkillSetupPanel } from './AgentSkillSetupPanel'
import { TooltipProvider } from '../ui/tooltip'
import { applySkillsViewerRequest } from '../../runtime/skills-viewer-request'
import { useAppStore } from '@/store'
const provider = vi.hoisted(() => ({
  clipboard: vi.fn(async (_text: string) => undefined),
  terminal: vi.fn((_props: { command: string; onTerminalExit?: () => void }) => null),
  success: vi.fn(),
  error: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { success: provider.success, error: provider.error } }))
vi.mock('../onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: provider.terminal
}))
vi.mock('@/hooks/useInstalledAgentSkills', () => ({ notifyInstalledAgentSkillsRefreshed: vi.fn() }))
vi.mock('@/hooks/useSkillFreshness', () => ({ refreshSkillFreshness: vi.fn() }))
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const refresh = async () => undefined
const props: ComponentProps<typeof AgentSkillSetupPanel> = {
  title: 'Setup',
  description: null,
  command: 'install-command',
  installedCommand: 'update-command',
  terminalTitle: 'Setup',
  terminalAriaLabel: 'Setup terminal',
  terminalWorktreeId: 'panel',
  installed: false,
  loading: false,
  error: null,
  onRecheck: refresh
}
function Panel({ installed = false }: { installed?: boolean }) {
  return (
    <TooltipProvider>
      <AgentSkillSetupPanel {...props} installed={installed} />
    </TooltipProvider>
  )
}
async function state() {
  const result = await applySkillsViewerRequest({ kind: 'setup-form', action: { kind: 'get' } })
  if (!('setupPanels' in result) || !result.setupPanels[0]) {
    throw new Error('missing setup panel')
  }
  return result.setupPanels[0]
}
async function copy(reviewedTarget?: string) {
  return applySkillsViewerRequest({
    kind: 'setup-form',
    action: {
      kind: 'copy-command',
      panelKey: 'panel',
      reviewedTarget: reviewedTarget ?? (await state()).reviewedTarget
    }
  })
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  await act(async () => undefined)
}
beforeEach(() => {
  vi.clearAllMocks()
  provider.clipboard.mockResolvedValue(undefined)
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeClipboardText: provider.clipboard } }
  })
})
afterEach(() => {
  cleanup()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('copies the same pinned terminal command through native and routed CLI callbacks', async () => {
  const view = render(<Panel />)
  const closed = await state()
  await open()
  await expect(copy(closed.reviewedTarget)).rejects.toThrow('viewer_target_changed')
  view.rerender(<Panel installed />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy command' }))
  await act(async () => undefined)
  await expect(copy()).resolves.toMatchObject({ setupPanels: [{ canCopy: true, busy: false }] })
  expect(provider.clipboard.mock.calls).toEqual([['install-command'], ['install-command']])
  expect(provider.success).toHaveBeenCalledTimes(2)
  expect(provider.terminal.mock.calls.at(-1)?.[0].command).toBe('install-command')
})
it('reports clipboard failures and allows a reviewed retry', async () => {
  render(<Panel />)
  await open()
  provider.clipboard.mockRejectedValueOnce(new Error('clipboard unavailable'))
  await expect(copy()).rejects.toThrow('skill_setup_copy_failed')
  expect(provider.error).toHaveBeenCalledWith('clipboard unavailable')
  expect(provider.success).not.toHaveBeenCalled()
  await expect(copy()).resolves.toMatchObject({ setupPanels: [{ busy: false }] })
  expect(provider.success).toHaveBeenCalledOnce()
})
it('refuses closed terminals and invalidates reviewed copies after terminal exit', async () => {
  render(<Panel />)
  await expect(copy()).rejects.toThrow('skill_setup_copy-command_unavailable')
  await open()
  const opened = await state()
  await act(async () => provider.terminal.mock.calls.at(-1)?.[0].onTerminalExit?.())
  await expect(copy(opened.reviewedTarget)).rejects.toThrow('viewer_target_changed')
  await expect(copy()).rejects.toThrow('skill_setup_copy-command_unavailable')
  expect(provider.clipboard).not.toHaveBeenCalled()
})
