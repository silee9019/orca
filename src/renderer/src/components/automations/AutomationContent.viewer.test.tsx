// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { AutomationPromptDisclosure } from './AutomationPromptDisclosure'
import { HermesCronOutputView } from './HermesCronOutputView'
import {
  applyAutomationContent as apply,
  automationContentSnapshot as get
} from '../../runtime/automation-content-viewer'
vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>
}))
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'profile' })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(180)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(80)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
function review(kind: 'prompt' | 'hermes-output') {
  const target = get().find((target) => target.kind === kind)
  if (!target) {
    throw new Error('missing disclosure')
  }
  return target
}
async function request(expanded: boolean, target: string) {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(expanded, target)
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
it('uses the actual prompt toggle for native and CLI expansion with committed aria state', async () => {
  render(<AutomationPromptDisclosure prompt="private fixture prompt" ownerKey="ssh:automation" />)
  expect(JSON.stringify(get())).not.toContain('private fixture prompt')
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
  expect(review('prompt').expanded).toBe(true)
  const collapsed = await request(false, review('prompt').reviewedTarget)
  expect(collapsed.expanded).toBe(false)
  expect(screen.getByRole('button', { name: 'Show more' }).getAttribute('aria-expanded')).toBe(
    'false'
  )
  expect((await request(true, collapsed.reviewedTarget)).expanded).toBe(true)
  expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe(
    'true'
  )
})
it('toggles actual Hermes output sections independently without copying their content', async () => {
  render(
    <HermesCronOutputView
      ownerKey="ssh:run1"
      content={'## Prompt\nprivate prompt body\n\n## Trace\nprivate trace body'}
    />
  )
  const targets = get()
  expect(targets.length).toBe(2)
  expect(JSON.stringify(targets)).not.toContain('private')
  const trace = targets.find((target) => target.label === 'Trace')
  if (!trace) {
    throw new Error('missing trace')
  }
  expect(screen.queryByText('private trace body')).toBeNull()
  await request(true, trace.reviewedTarget)
  expect(screen.getByText('private trace body')).toBeTruthy()
  expect(screen.queryByText('private prompt body')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Trace' }))
  expect(screen.queryByText('private trace body')).toBeNull()
})
it('rejects content, owner and profile ABA reviews and modal targets', async () => {
  const view = render(<AutomationPromptDisclosure ownerKey="ssh:1" prompt="first" />)
  const old = review('prompt').reviewedTarget
  view.rerender(<AutomationPromptDisclosure ownerKey="ssh:1" prompt="second" />)
  view.rerender(<AutomationPromptDisclosure ownerKey="ssh:1" prompt="first" />)
  await expect(request(true, old)).rejects.toThrow('viewer_target_changed')
  const owner = review('prompt').reviewedTarget
  view.rerender(<AutomationPromptDisclosure ownerKey="ssh:2" prompt="first" />)
  await expect(request(true, owner)).rejects.toThrow('viewer_target_changed')
  const profile = review('prompt').reviewedTarget
  act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
  act(() => useAppStore.setState({ activeOrcaProfileId: 'profile' }))
  await expect(request(true, profile)).rejects.toThrow('viewer_target_changed')
  act(() => useAppStore.setState({ activeModal: 'create-worktree' }))
  await expect(request(true, review('prompt').reviewedTarget)).rejects.toThrow('viewer_modal_open')
  view.unmount()
  await expect(apply(true, old)).rejects.toThrow('viewer_unavailable')
})
it('refuses non-overflowing prompts', async () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(60)
  render(<AutomationPromptDisclosure prompt="short" />)
  expect(review('prompt').canToggle).toBe(false)
  await expect(request(true, review('prompt').reviewedTarget)).rejects.toThrow(
    'automation_content_toggle_unavailable'
  )
})
