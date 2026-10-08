// @vitest-environment happy-dom
import { act, useCallback } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { applyAutomationViewerRequest as apply } from './automation-viewer-request'
import { useWorkspaceAutomationViewer } from './workspace-automation-viewer'

const navigate = vi.fn(() => {
  useAppStore.setState({
    activeView: 'automations',
    pendingAutomationRunNavigation: { automationId: 'automation', runId: 'run', hostId: 'local' }
  })
})
function Form({
  owner = 'workspace',
  available = true,
  callback = navigate
}: {
  owner?: string
  available?: boolean
  callback?: () => void
}) {
  const openAutomation = useCallback(() => callback(), [callback])
  useWorkspaceAutomationViewer({
    sectionKey: 'section',
    target: { workspaceId: owner, hostId: 'local' },
    provenance: {
      kind: 'created-by-automation',
      automationId: 'automation',
      automationRunId: 'run',
      automationNameSnapshot: 'Automation',
      automationRunTitleSnapshot: 'Run',
      createdAt: 1,
      executionTargetType: 'local',
      executionTargetId: 'local',
      projectId: 'repo',
      hostId: 'local'
    },
    canOpenAutomation: available,
    canOpenRun: available,
    openAutomation,
    openRun: callback
  })
  return null
}
async function review() {
  const result = await apply({ kind: 'workspace-provenance-form', action: { kind: 'get' } })
  if (!('workspaceAutomations' in result) || !result.workspaceAutomations[0]) {
    throw new Error('missing section')
  }
  return result.workspaceAutomations[0]
}
function open(state: Awaited<ReturnType<typeof review>>) {
  const request = apply({
    kind: 'workspace-provenance-form',
    action: {
      kind: 'open-run',
      sectionKey: state.sectionKey,
      reviewedTarget: state.reviewedTarget
    }
  })
  void request.catch(() => undefined)
  return request
}
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({
    activeView: 'terminal',
    activeOrcaProfileId: 'first',
    activeModal: 'none',
    pendingAutomationRunNavigation: null
  })
})
afterEach(cleanup)
it.each(['owner', 'availability', 'callback', 'profile', 'modal'])(
  'invalidates a reviewed target across %s ABA commits',
  async (change) => {
    const view = render(<Form />)
    const state = await review()
    if (change === 'owner') {
      view.rerender(<Form owner="other" />)
      view.rerender(<Form />)
    } else if (change === 'availability') {
      view.rerender(<Form available={false} />)
      view.rerender(<Form />)
    } else if (change === 'callback') {
      view.rerender(<Form callback={() => undefined} />)
      view.rerender(<Form />)
    } else if (change === 'profile') {
      act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
      act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
    } else {
      act(() => useAppStore.setState({ activeModal: 'add-repo' }))
      act(() => useAppStore.setState({ activeModal: 'none' }))
    }
    await expect(open(state)).rejects.toThrow('viewer_target_changed')
    expect(navigate).not.toHaveBeenCalled()
  }
)
it('rechecks owner before dispatch and prevents duplicate requests', async () => {
  const view = render(<Form />)
  const state = await review()
  const first = open(state)
  await expect(open(state)).rejects.toThrow('viewer_busy')
  await first
  act(() => useAppStore.setState({ activeView: 'terminal', pendingAutomationRunNavigation: null }))
  const next = open(await review())
  view.rerender(<Form owner="other" />)
  await expect(next).rejects.toThrow('viewer_target_changed')
  expect(navigate).toHaveBeenCalledTimes(1)
})
it('rejects unmount before dispatch and unavailable or ambiguous sections', async () => {
  const view = render(<Form />)
  const state = await review()
  const request = open(state)
  view.unmount()
  await expect(request).rejects.toThrow(/viewer_(unmounted|target_changed)/)
  await expect(open(state)).rejects.toThrow('viewer_unavailable')
  render(
    <>
      <Form />
      <Form />
    </>
  )
  await expect(open(await review())).rejects.toThrow('viewer_ambiguous')
  expect(navigate).not.toHaveBeenCalled()
})
it.each(['no-op', 'throw', 'wrong-host', 'owner-change'])(
  'requires exact navigation commitment after a %s callback',
  async (mode) => {
    const callback = vi.fn(() => {
      if (mode === 'throw') {
        throw new Error('navigation failed')
      }
      if (mode === 'wrong-host') {
        useAppStore.setState({
          activeView: 'automations',
          pendingAutomationRunNavigation: {
            automationId: 'automation',
            runId: 'run',
            hostId: 'runtime:other'
          }
        })
      }
      if (mode === 'owner-change') {
        useAppStore.setState({ activeOrcaProfileId: 'other' })
      }
    })
    const view = render(<Form callback={callback} />)
    await expect(open(await review())).rejects.toThrow(
      mode === 'throw'
        ? 'navigation failed'
        : mode === 'owner-change'
          ? 'viewer_target_changed'
          : 'workspace_automation_navigation_not_committed'
    )
    expect((await review()).busy).toBe(false)
    view.rerender(<Form />)
    await expect(open(await review())).resolves.toMatchObject({ requested: true })
    expect(callback).toHaveBeenCalledOnce()
  }
)
