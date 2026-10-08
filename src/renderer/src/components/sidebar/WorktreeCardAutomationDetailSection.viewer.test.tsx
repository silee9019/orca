// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { useWorktreeCardFoundation } from './use-worktree-card-foundation'
import { WorktreeCardDetailsHover } from './WorktreeCardMeta'
import { TooltipProvider } from '../ui/tooltip'
import type { Worktree, AutomationWorkspaceProvenance } from '../../../../shared/worktree/types'
import { applyAutomationViewerRequest as apply } from '@/runtime/automation-viewer-request'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type * as AutomationHostClient from '../automations/automation-host-client'

const provider = vi.hoisted(() => ({
  automations: vi.fn(),
  runs: vi.fn(),
  ui: vi.fn(),
  outer: vi.fn()
}))
vi.mock('../automations/automation-host-client', async (original) => ({
  ...(await original<typeof AutomationHostClient>()),
  listAutomationsForTarget: provider.automations,
  listAutomationRunsForTarget: provider.runs
}))
vi.mock('../ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
const provenance: AutomationWorkspaceProvenance = {
  kind: 'created-by-automation',
  automationId: 'automation',
  automationNameSnapshot: 'Nightly',
  automationRunId: 'run',
  automationRunTitleSnapshot: 'Nightly run',
  createdAt: 1,
  executionTargetType: 'local',
  executionTargetId: 'local',
  projectId: 'repo',
  hostId: 'local'
}
function worktree(
  record: AutomationWorkspaceProvenance,
  hostId: ExecutionHostId = 'local',
  folder = false
): Worktree {
  return {
    id: folder ? 'folder:folder-id' : 'repo::/repo/worktree',
    repoId: 'repo',
    path: '/repo/worktree',
    displayName: 'Workspace',
    branch: 'main',
    head: 'abc',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    hostId,
    automationProvenance: record
  }
}
function Harness({
  record = provenance,
  host = 'local',
  folder = false,
  affiliate = false,
  handoff = true,
  probe
}: {
  record?: AutomationWorkspaceProvenance
  host?: ExecutionHostId
  folder?: boolean
  affiliate?: boolean
  handoff?: boolean
  probe?: () => void
}) {
  const foundation = useWorktreeCardFoundation({
    worktree: worktree(record, host, folder),
    repo: { id: 'repo', path: '/repo', displayName: 'Repo', badgeColor: 'blue', addedAt: 1 }
  })
  const activeView = useAppStore((state) => state.activeView)
  useLayoutEffect(() => {
    probe?.()
  })
  if (handoff && activeView === 'automations') {
    return null
  }
  return (
    <TooltipProvider>
      <div onClick={provider.outer}>
        <WorktreeCardDetailsHover
          issue={null}
          linearIssue={null}
          review={null}
          comment=""
          automationProvenance={record}
          automationNavigationTarget={foundation.automationNavigationTarget}
          onOpenAutomation={affiliate ? undefined : foundation.handleOpenAutomation}
          onOpenAutomationRun={affiliate ? undefined : foundation.handleOpenAutomationRun}
        >
          <span>Workspace</span>
        </WorktreeCardDetailsHover>
      </div>
    </TooltipProvider>
  )
}
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
beforeEach(() => {
  vi.clearAllMocks()
  provider.automations.mockResolvedValue([{ id: 'automation' }])
  provider.runs.mockResolvedValue([{ id: 'run' }])
  provider.ui.mockResolvedValue(undefined)
  useAppStore.setState({
    activeView: 'terminal',
    activeOrcaProfileId: 'first',
    activeModal: 'none',
    pendingAutomationRunNavigation: null
  })
  Object.defineProperty(window, 'api', { configurable: true, value: { ui: { set: provider.ui } } })
})
afterEach(() => {
  cleanup()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
async function section() {
  const result = await apply({ kind: 'workspace-provenance-form', action: { kind: 'get' } })
  if (!('workspaceAutomations' in result) || !result.workspaceAutomations[0]) {
    throw new Error('missing workspace automation')
  }
  return result.workspaceAutomations[0]
}
async function start(kind: 'open-automation' | 'open-run') {
  const reviewed = await section()
  const pending = apply({
    kind: 'workspace-provenance-form',
    action: { kind, sectionKey: reviewed.sectionKey, reviewedTarget: reviewed.reviewedTarget }
  })
  void pending.catch(() => undefined)
  return { pending }
}
it.each(['local', 'ssh:remote', 'runtime:env'] as const)(
  'keeps native/CLI navigation on recorded %s rather than the workspace host',
  async (host) => {
    for (const mode of ['native', 'cli']) {
      useAppStore.setState({ activeView: 'terminal', pendingAutomationRunNavigation: null })
      const view = render(
        <Harness record={{ ...provenance, hostId: host }} host="runtime:workspace" />
      )
      const button = await screen.findByRole('button', { name: 'Open run' })
      if (mode === 'native') {
        fireEvent.click(button)
      } else {
        const { pending } = await start('open-run')
        await act(async () => undefined)
        await expect(pending).resolves.toMatchObject({
          navigation: { automationId: 'automation', runId: 'run', hostId: host }
        })
      }
      expect(useAppStore.getState().pendingAutomationRunNavigation).toEqual({
        automationId: 'automation',
        runId: 'run',
        hostId: host
      })
      expect(useAppStore.getState().activeView).toBe('automations')
      expect(screen.queryByRole('button', { name: 'Open run' })).toBeNull()
      expect(provider.outer).not.toHaveBeenCalled()
      view.unmount()
    }
  }
)
it('preserves folder workspace and legacy navigation host fallback while checking the provenance host', async () => {
  const record = { ...provenance, hostId: undefined }
  render(<Harness record={record} host="runtime:folder-owner" folder />)
  await screen.findByRole('button', { name: 'Open automation' })
  const reviewed = await section()
  expect(reviewed.navigationHostId).toBe('runtime:folder-owner')
  expect(provider.automations).toHaveBeenCalledWith({ kind: 'local' })
  const { pending } = await start('open-automation')
  await act(async () => undefined)
  await expect(pending).resolves.toMatchObject({
    navigation: { automationId: 'automation', runId: null, hostId: 'runtime:folder-owner' }
  })
})
it.each(['missing', 'run-missing', 'unavailable', 'affiliate'])(
  'rejects navigation hidden by native %s availability',
  async (reason) => {
    if (reason === 'missing') {
      provider.automations.mockResolvedValue([])
    }
    if (reason === 'run-missing') {
      provider.runs.mockResolvedValue([])
    }
    if (reason === 'unavailable') {
      provider.automations.mockRejectedValue(new Error('host unavailable'))
    }
    render(<Harness affiliate={reason === 'affiliate'} />)
    await waitFor(() => expect(provider.automations).toHaveBeenCalled())
    await act(async () => undefined)
    await expect((await start('open-run')).pending).rejects.toThrow(
      'workspace_automation_unavailable'
    )
    expect(useAppStore.getState().pendingAutomationRunNavigation).toBeNull()
  }
)

it('does not reuse availability from the previous provenance before passive effects run', async () => {
  const view = render(<Harness handoff={false} />)
  await screen.findByRole('button', { name: 'Open run' })
  provider.automations.mockReturnValue(new Promise(() => undefined))
  const observed: boolean[] = []
  view.rerender(
    <Harness
      handoff={false}
      record={{ ...provenance, hostId: 'runtime:new' }}
      probe={() => {
        void section().then((state) => observed.push(state.canOpenRun))
      }}
    />
  )
  await act(async () => undefined)
  expect(observed[0]).toBe(false)
})
