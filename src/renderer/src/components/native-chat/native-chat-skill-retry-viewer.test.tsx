// @vitest-environment happy-dom
import { act, useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useNativeChatPickerState } from './use-native-chat-picker-state'
import { NativeChatComposerField } from './NativeChatComposerField'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import type { AgentType } from '../../../../shared/agent-status-types'
import { useImeEnterGestureOwnership } from '@/lib/ime-composition-keyboard-event'
import { applySkillsViewerRequest as apply } from '../../runtime/skills-viewer-request'
import { resetNativeChatSkillDiscoveryCacheForTests } from './use-native-chat-skills'

const provider = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  return { rpc: vi.fn(), state }
})
vi.mock('../../store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(provider.state)
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: (...args: unknown[]) => provider.rpc(...args)
}))
vi.mock('@/lib/local-preflight-context', () => ({
  getLocalProjectExecutionRuntimeContext: () => undefined
}))
vi.mock('@/lib/native-chat-telemetry', () => ({
  emitNativeChatSkillDiscovery: vi.fn(),
  emitNativeChatPickerOpened: vi.fn(),
  emitNativeChatPickerItemAccepted: vi.fn(),
  emitNativeChatSendClassified: vi.fn()
}))
vi.mock('./NativeChatPromptEditor', () => ({ NativeChatPromptEditor: () => null }))
vi.mock('./NativeChatComposerActions', () => ({ NativeChatComposerActions: () => null }))
vi.mock('./use-native-chat-draft-unsaved', () => ({
  useNativeChatComposerDraftUnsaved: () => false
}))

function stateForHost(hostId = 'local') {
  return {
    activeModal: 'none',
    activeOrcaProfileId: 'first',
    activeRepoId: 'repo',
    activeWorktreeId: 'worktree',
    folderWorkspaces: [],
    projectGroups: [],
    projects: [],
    repos: [{ id: 'repo', path: '/repo', executionHostId: hostId }],
    restoredRuntimeHostIdByWorkspaceSessionKey: {},
    settings: { activeRuntimeEnvironmentId: null },
    tabsByWorktree: { worktree: [{ id: 'tab' }, { id: 'other-tab' }] },
    unifiedTabsByWorktree: {},
    worktreesByRepo: { repo: [{ id: 'worktree', repoId: 'repo', path: '/repo/worktree', hostId }] }
  }
}
const noop = () => undefined
function Harness({
  draft = '/',
  tab = 'tab',
  pane = 'pane',
  agent = 'codex'
}: {
  draft?: string
  tab?: string
  pane?: string
  agent?: AgentType
}) {
  const input = useRef<NativeChatComposerInput | null>(null)
  const [, setCaret] = useState(0)
  const [, setActive] = useState(0)
  const picker = useNativeChatPickerState({
    agent,
    terminalTabId: tab,
    draftScopeKey: pane,
    draft,
    caret: draft.length,
    agentCommands: [],
    textareaRef: input,
    setDraft: noop,
    setCaret,
    setActiveSuggestion: setActive
  })
  const ime = useImeEnterGestureOwnership()
  return (
    <>
      <button
        onClick={() =>
          picker.autocomplete.mode === 'slash' && picker.dismiss(picker.autocomplete.triggerKey)
        }
      >
        Dismiss
      </button>
      <button onClick={picker.retrySkills}>Native concurrent retry</button>
      <NativeChatComposerField
        dropScopeKey={pane}
        draftScopeKey={pane}
        textareaRef={input}
        draft={draft}
        disabled={false}
        hasPty
        canSend
        autocomplete={picker.autocomplete}
        activeSuggestion={0}
        notice={null}
        imageAttachments={[]}
        sendButtonDisabled={false}
        isWorking={false}
        attachDisabled={false}
        dictationDisabled
        isDictating={false}
        isDictationHoldMode={false}
        imeEnterGesture={ime}
        onDraftChange={noop}
        onTextareaSelect={noop}
        onKeyDown={noop}
        onImeSettled={noop}
        onPaste={noop}
        pickerListboxId={picker.listboxId}
        onChoosePickerItem={picker.completeItem}
        onRetrySkills={picker.retrySkills}
        onAcceptMention={noop}
        onRemoveImageAttachment={noop}
        onAttach={noop}
        onDictationToggle={noop}
        onDictationHoldStart={noop}
        onDictationHoldEnd={noop}
        onSend={noop}
        sessionOptionsSurface={null}
        sessionOptionsSnapshot={[]}
      />
    </>
  )
}
const result = { skills: [], sources: [], scannedAt: 1 }
let finish: ((value: typeof result) => void) | undefined
let fail: ((error: Error) => void) | undefined
beforeEach(() => {
  provider.state = stateForHost()
  provider.rpc
    .mockReset()
    .mockRejectedValueOnce(new Error('initial failure'))
    .mockImplementation(
      () =>
        new Promise<typeof result>((resolve, reject) => {
          finish = resolve
          fail = reject
        })
    )
  finish = undefined
  fail = undefined
  resetNativeChatSkillDiscoveryCacheForTests()
})
afterEach(cleanup)
async function panel() {
  const response = await apply({ kind: 'setup-form', action: { kind: 'get' } })
  if (!('setupPanels' in response) || !response.setupPanels[0]) {
    throw new Error('missing retry panel')
  }
  return response.setupPanels[0]
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
  void pending.catch(noop)
  return { pending }
}
async function initialError() {
  await screen.findByRole('button', { name: 'Retry' })
}
it.each(['native', 'cli'])(
  'uses the actual Field and discovery forced scan through %s',
  async (mode) => {
    render(<Harness />)
    await initialError()
    let pending: ReturnType<typeof apply> | undefined
    if (mode === 'native') {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    } else {
      ;({ pending } = await start())
    }
    await waitFor(() => expect(provider.rpc).toHaveBeenCalledTimes(2))
    expect(provider.rpc).toHaveBeenLastCalledWith(
      { kind: 'local' },
      'skills.discover',
      { cwd: '/repo/worktree', worktreeId: 'worktree', refresh: true },
      { timeoutMs: 10_000 }
    )
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    let completed = false
    void pending?.then(() => {
      completed = true
    })
    await act(async () => undefined)
    expect(completed).toBe(false)
    await act(async () => finish?.(result))
    if (pending) {
      await expect(pending).resolves.toMatchObject({
        setupPanels: [{ installed: null, loading: false, error: null, busy: false }]
      })
    }
    expect(provider.rpc).toHaveBeenCalledTimes(2)
  }
)
it('reports the committed retry failure and permits another real retry', async () => {
  render(<Harness />)
  await initialError()
  const { pending } = await start()
  await waitFor(() => expect(provider.rpc).toHaveBeenCalledTimes(2))
  await expect((await start()).pending).rejects.toThrow('viewer_busy')
  await act(async () => fail?.(new Error('host timeout')))
  await expect(pending).resolves.toMatchObject({
    setupPanels: [{ error: 'host timeout', loading: false, canRecheck: true }]
  })
  const second = await start()
  await waitFor(() => expect(provider.rpc).toHaveBeenCalledTimes(3))
  await act(async () => finish?.(result))
  await expect(second.pending).resolves.toMatchObject({ setupPanels: [{ error: null }] })
})
it.each([
  'dismiss',
  'draft',
  'tab',
  'pane',
  'agent',
  'host',
  'profile',
  'modal',
  'unmount',
  'native'
])('cancels a held scan across %s and rejects its late completion', async (change) => {
  const view = render(<Harness />)
  await initialError()
  const { pending } = await start()
  await waitFor(() => expect(provider.rpc).toHaveBeenCalledTimes(2))
  const originalFinish = finish
  if (change === 'dismiss') {
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  }
  if (change === 'draft') {
    view.rerender(<Harness draft="hello" />)
    view.rerender(<Harness />)
  }
  if (change === 'tab') {
    view.rerender(<Harness tab="other-tab" />)
    view.rerender(<Harness />)
  }
  if (change === 'pane') {
    view.rerender(<Harness pane="other" />)
    view.rerender(<Harness />)
  }
  if (change === 'agent') {
    view.rerender(<Harness agent="claude" />)
    view.rerender(<Harness />)
  }
  if (change === 'host') {
    provider.state = stateForHost('runtime:other')
    view.rerender(<Harness />)
    provider.state = stateForHost()
    view.rerender(<Harness />)
  }
  if (change === 'profile' || change === 'modal') {
    const key = change === 'profile' ? 'activeOrcaProfileId' : 'activeModal'
    provider.state = { ...provider.state, [key]: 'other' }
    view.rerender(<Harness />)
    provider.state = { ...provider.state, [key]: change === 'profile' ? 'first' : 'none' }
    view.rerender(<Harness />)
  }
  if (change === 'unmount') {
    view.unmount()
  }
  if (change === 'native') {
    fireEvent.click(screen.getByRole('button', { name: 'Native concurrent retry' }))
  }
  await expect(pending).rejects.toThrow(/viewer_target_changed|viewer_unmounted/)
  await act(async () => originalFinish?.(result))
})
it('exposes no retry while the native menu is closed, ready, or SSH unavailable', async () => {
  const view = render(<Harness />)
  await initialError()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  await expect((await start()).pending).rejects.toThrow('skill_setup_recheck_unavailable')
  view.unmount()
  provider.state = stateForHost('ssh:connection')
  render(<Harness />)
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  await expect((await start()).pending).rejects.toThrow('skill_setup_recheck_unavailable')
  expect(provider.rpc).toHaveBeenCalledTimes(1)
})
it('keeps forced retry on the runtime owner without falling back locally', async () => {
  provider.state = stateForHost('runtime:env')
  render(<Harness />)
  await initialError()
  const { pending } = await start()
  await waitFor(() => expect(provider.rpc).toHaveBeenCalledTimes(2))
  expect(provider.rpc).toHaveBeenLastCalledWith(
    { kind: 'environment', environmentId: 'env' },
    'skills.discover',
    { cwd: '/repo/worktree', worktreeId: 'worktree', refresh: true },
    { timeoutMs: 10_000 }
  )
  await act(async () => fail?.(new Error('runtime failed')))
  await expect(pending).resolves.toMatchObject({ setupPanels: [{ error: 'runtime failed' }] })
  expect(provider.rpc).toHaveBeenCalledTimes(2)
})

it('invalidates the old review after a native retry finishes with another error', async () => {
  render(<Harness />)
  await initialError()
  const reviewed = await panel()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(provider.rpc).toHaveBeenCalledTimes(2))
  await act(async () => fail?.(new Error('still failing')))
  await expect(
    apply({
      kind: 'setup-form',
      action: {
        kind: 'recheck',
        panelKey: reviewed.panelKey,
        reviewedTarget: reviewed.reviewedTarget
      }
    })
  ).rejects.toThrow('viewer_target_changed')
  expect(provider.rpc).toHaveBeenCalledTimes(2)
})
it('refuses rechecks after ready and refuses a target change before dispatch', async () => {
  const view = render(<Harness />)
  await initialError()
  const reviewed = await panel()
  const pending = apply({
    kind: 'setup-form',
    action: {
      kind: 'recheck',
      panelKey: reviewed.panelKey,
      reviewedTarget: reviewed.reviewedTarget
    }
  })
  void pending.catch(noop)
  view.rerender(<Harness pane="other" />)
  view.rerender(<Harness />)
  await expect(pending).rejects.toThrow('viewer_target_changed')
  expect(provider.rpc).toHaveBeenCalledTimes(1)
  const next = await start()
  await waitFor(() => expect(provider.rpc).toHaveBeenCalledTimes(2))
  await act(async () => finish?.(result))
  await next.pending
  await expect((await start()).pending).rejects.toThrow('skill_setup_recheck_unavailable')
})
it('uses the folder workspace owner instead of requiring a git worktree', async () => {
  provider.state = {
    ...stateForHost(),
    activeRepoId: null,
    activeWorktreeId: 'folder:folder-id',
    repos: [],
    folderWorkspaces: [{ id: 'folder-id', folderPath: '/folder', hostId: 'local' }],
    tabsByWorktree: { 'folder:folder-id': [{ id: 'tab' }] },
    worktreesByRepo: {}
  }
  render(<Harness />)
  await initialError()
  const { pending } = await start()
  await waitFor(() => expect(provider.rpc).toHaveBeenCalledTimes(2))
  expect(provider.rpc).toHaveBeenLastCalledWith(
    { kind: 'local' },
    'skills.discover',
    { cwd: '/folder', worktreeId: 'folder:folder-id', refresh: true },
    { timeoutMs: 10_000 }
  )
  await act(async () => finish?.(result))
  await expect(pending).resolves.toMatchObject({ setupPanels: [{ error: null }] })
})

it('does not start another scan when native Retry wins before CLI dispatch', async () => {
  render(<Harness />)
  await initialError()
  const reviewed = await panel()
  const pending = apply({
    kind: 'setup-form',
    action: {
      kind: 'recheck',
      panelKey: reviewed.panelKey,
      reviewedTarget: reviewed.reviewedTarget
    }
  })
  void pending.catch(noop)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await expect(pending).rejects.toThrow('viewer_target_changed')
  await waitFor(() => expect(provider.rpc).toHaveBeenCalledTimes(2))
  await act(async () => finish?.(result))
  expect(provider.rpc).toHaveBeenCalledTimes(2)
})
it('rejects duplicate mounted pane targets without dispatching a retry', async () => {
  render(
    <>
      <Harness />
      <Harness />
    </>
  )
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2))
  await expect((await start()).pending).rejects.toThrow('viewer_ambiguous')
  expect(provider.rpc).toHaveBeenCalledTimes(1)
})
