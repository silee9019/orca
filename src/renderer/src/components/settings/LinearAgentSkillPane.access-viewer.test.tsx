// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { applySkillsViewerRequest as apply } from '@/runtime/skills-viewer-request'
import { getDefaultSettings } from '../../../../shared/constants'
import { LinearAgentSkillPane } from './LinearAgentSkillPane'
import { TooltipProvider } from '../ui/tooltip'
import { LINEAR_INTEGRATION_SECTION_ID } from './task-provider-integration-section-ids'
vi.mock('./AgentSkillSetupPanel', () => ({ AgentSkillSetupPanel: () => null }))
vi.mock('./use-linear-agent-skill-setup', () => ({
  useLinearAgentSkillSetup: () => ({
    installCommand: 'reviewed install command',
    updateCommand: 'reviewed update command',
    skillInstalled: true,
    skillLoading: false,
    skillChecking: false,
    skillUnverifiable: false,
    installDisabled: false,
    refreshSkill: () => undefined
  })
}))
function Harness({ handoff = false }: { handoff?: boolean }) {
  const target = useAppStore((state) => state.settingsNavigationTarget)
  return handoff && target ? null : (
    <TooltipProvider>
      <LinearAgentSkillPane />
    </TooltipProvider>
  )
}
const connect = vi.fn()
const check = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  const settings = getDefaultSettings('/fixture')
  useAppStore.setState({
    settings,
    activeView: 'settings',
    settingsNavigationTarget: null,
    settingsSearchQuery: '',
    activeOrcaProfileId: 'first',
    activeModal: 'none',
    linearStatusContextKey: getProviderRuntimeContextKey(settings),
    linearStatusChecked: true,
    linearStatus: { ...useAppStore.getState().linearStatus, connected: false },
    connectLinear: connect,
    checkLinearConnection: check
  })
})
afterEach(cleanup)
async function review() {
  const result = await apply({ kind: 'linear-access-form', action: { kind: 'get' } })
  if (!('linearAccessPanes' in result) || !result.linearAccessPanes[0]) {
    throw new Error('missing pane')
  }
  return result.linearAccessPanes[0]
}
function request(
  kind: 'open-task-sources' | 'manage-access' | 'open-integrations' | 'close-access-dialog',
  state: Awaited<ReturnType<typeof review>>
) {
  const pending = apply({
    kind: 'linear-access-form',
    action: { kind, paneKey: state.paneKey, reviewedTarget: state.reviewedTarget }
  })
  void pending.catch(() => undefined)
  return pending
}
it.each([false, true])(
  'opens the actual native/CLI access dialog when connected=%s',
  async (connected) => {
    for (const mode of ['native', 'cli']) {
      useAppStore.setState({
        linearStatus: { ...useAppStore.getState().linearStatus, connected },
        settingsNavigationTarget: null
      })
      const view = render(<Harness handoff />)
      if (mode === 'native') {
        fireEvent.click(
          screen.getByRole('button', { name: connected ? 'Manage keys' : 'Add access' })
        )
      } else {
        const state = await review()
        const pending = request('manage-access', state)
        await act(async () => undefined)
        await expect(pending).resolves.toMatchObject({
          linearAccessPanes: [
            { requested: true, destination: connected ? 'integrations' : 'key-dialog' }
          ]
        })
      }
      if (connected) {
        expect(useAppStore.getState().settingsNavigationTarget).toEqual({
          pane: 'integrations',
          repoId: null,
          sectionId: LINEAR_INTEGRATION_SECTION_ID
        })
      } else {
        await screen.findByRole('dialog', { name: 'Add Linear access' })
        expect(screen.getByLabelText('Personal API key')).toHaveProperty('value', '')
        await expect(request('open-task-sources', await review())).rejects.toThrow(
          'viewer_modal_open'
        )
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      }
      expect(connect).not.toHaveBeenCalled()
      expect(check).not.toHaveBeenCalled()
      view.unmount()
    }
  }
)
it('closes the actual key dialog like Cancel and rejects stale or closed-dialog requests', async () => {
  render(<Harness />)
  const closed = await review()
  await expect(request('close-access-dialog', closed)).rejects.toThrow(
    'linear_access_dialog_not_open'
  )
  const opening = request('manage-access', await review())
  await act(async () => undefined)
  await opening
  await screen.findByRole('dialog', { name: 'Add Linear access' })
  await expect(request('close-access-dialog', closed)).rejects.toThrow('viewer_target_changed')
  const closing = request('close-access-dialog', await review())
  await act(async () => undefined)
  await expect(closing).resolves.toMatchObject({
    linearAccessPanes: [{ requested: true, destination: 'closed', keyDialogOpen: false }]
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(connect).not.toHaveBeenCalled()
  expect(check).not.toHaveBeenCalled()
})
it('refreshes the connection after the actual dialog connects and the viewer reports it', async () => {
  connect.mockResolvedValue({ ok: true })
  check.mockImplementation(() =>
    useAppStore.setState({
      linearStatus: { ...useAppStore.getState().linearStatus, connected: true }
    })
  )
  render(<Harness />)
  const opening = request('manage-access', await review())
  await act(async () => undefined)
  await opening
  const dialog = await screen.findByRole('dialog', { name: 'Add Linear access' })
  fireEvent.change(within(dialog).getByLabelText('Personal API key'), {
    target: { value: 'fixture-linear-key' }
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add access' }))
  await waitFor(() => expect(check).toHaveBeenCalledExactlyOnceWith(true))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(connect).toHaveBeenCalledExactlyOnceWith('fixture-linear-key')
  expect(await review()).toMatchObject({ connected: true, keyDialogOpen: false })
})
it.each(['open-task-sources', 'open-integrations'] as const)(
  'preserves native/CLI %s target and own navigation unmount',
  async (kind) => {
    for (const mode of ['native', 'cli']) {
      useAppStore.setState({ settingsNavigationTarget: null })
      const view = render(<Harness handoff />)
      if (mode === 'native') {
        fireEvent.click(
          screen.getByRole('button', {
            name: kind === 'open-task-sources' ? 'Task Sources' : 'Integrations'
          })
        )
      } else {
        const pending = request(kind, await review())
        await act(async () => undefined)
        await expect(pending).resolves.toMatchObject({ linearAccessPanes: [{ requested: true }] })
      }
      expect(useAppStore.getState().activeView).toBe('settings')
      expect(useAppStore.getState().settingsNavigationTarget?.pane).toBe(
        kind === 'open-task-sources' ? 'tasks' : 'integrations'
      )
      expect(screen.queryByRole('button', { name: 'Task Sources' })).toBeNull()
      view.unmount()
    }
  }
)
it('does not register a pane hidden by the actual settings search', async () => {
  useAppStore.setState({ settingsSearchQuery: 'no matching linear setting' })
  render(<Harness />)
  await expect(apply({ kind: 'linear-access-form', action: { kind: 'get' } })).resolves.toEqual({
    linearAccessPanes: []
  })
})

it.each(['profile', 'modal', 'runtime', 'connected', 'callback'])(
  'invalidates old reviews across actual %s ABA commits',
  async (change) => {
    render(<Harness />)
    const state = await review()
    const original = useAppStore.getState()
    const settings = original.settings ?? getDefaultSettings('/fixture')
    act(() => {
      if (change === 'profile') {
        useAppStore.setState({ activeOrcaProfileId: 'other' })
      } else if (change === 'modal') {
        useAppStore.setState({ activeModal: 'add-repo' })
      } else if (change === 'runtime') {
        useAppStore.setState({ settings: { ...settings, activeRuntimeEnvironmentId: 'other' } })
      } else if (change === 'connected') {
        useAppStore.setState({ linearStatus: { ...original.linearStatus, connected: true } })
      } else {
        useAppStore.setState({ openSettingsPage: () => undefined })
      }
    })
    act(() =>
      useAppStore.setState({
        activeOrcaProfileId: original.activeOrcaProfileId,
        activeModal: original.activeModal,
        settings,
        linearStatus: original.linearStatus,
        openSettingsPage: original.openSettingsPage
      })
    )
    await expect(request('open-task-sources', state)).rejects.toThrow('viewer_target_changed')
    expect(useAppStore.getState().settingsNavigationTarget).toBeNull()
  }
)
it('rechecks the runtime before dispatch, blocks duplicates and rejects arbitrary unmount', async () => {
  const view = render(<Harness />)
  const state = await review()
  const pending = request('open-task-sources', state)
  const duplicate = request('open-task-sources', state)
  await expect(duplicate).rejects.toThrow('viewer_busy')
  await act(async () => undefined)
  await pending
  act(() => useAppStore.setState({ settingsNavigationTarget: null }))
  const next = request('manage-access', await review())
  view.unmount()
  await expect(next).rejects.toThrow(/viewer_(unmounted|target_changed)/)
  expect(connect).not.toHaveBeenCalled()
})
it('requires actual settings navigation after no-op or throwing callbacks', async () => {
  const original = useAppStore.getState().openSettingsTarget
  try {
    useAppStore.setState({ openSettingsTarget: () => undefined })
    const view = render(<Harness />)
    await expect(request('open-task-sources', await review())).rejects.toThrow(
      'linear_access_not_committed'
    )
    act(() =>
      useAppStore.setState({
        openSettingsTarget: () => {
          throw new Error('navigation failed')
        }
      })
    )
    await expect(request('open-task-sources', await review())).rejects.toThrow('navigation failed')
    act(() => useAppStore.setState({ openSettingsTarget: original }))
    await expect(request('open-task-sources', await review())).resolves.toMatchObject({
      linearAccessPanes: [{ requested: true }]
    })
    view.unmount()
  } finally {
    useAppStore.setState({ openSettingsTarget: original })
  }
})

it.each([undefined, 'environment'])(
  'keeps access on runtime %s without connecting credentials',
  async (environmentId) => {
    const settings = {
      ...getDefaultSettings('/fixture'),
      activeRuntimeEnvironmentId: environmentId
    }
    useAppStore.setState({
      settings,
      linearStatusContextKey: getProviderRuntimeContextKey(settings)
    })
    render(<Harness />)
    const pending = request('manage-access', await review())
    await act(async () => undefined)
    await expect(pending).resolves.toMatchObject({
      linearAccessPanes: [{ keyDialogOpen: true, destination: 'key-dialog' }]
    })
    expect(screen.getByRole('dialog').textContent).toContain(
      environmentId ? 'stored by the active remote runtime' : 'stored on this device'
    )
    expect(connect).not.toHaveBeenCalled()
  }
)
it('rejects a runtime switch before callback dispatch and a newly opened modal', async () => {
  render(<Harness />)
  const original = useAppStore.getState().settings ?? getDefaultSettings('/fixture')
  const pending = request('manage-access', await review())
  act(() =>
    useAppStore.setState({ settings: { ...original, activeRuntimeEnvironmentId: 'other' } })
  )
  await expect(pending).rejects.toThrow('viewer_target_changed')
  expect(screen.queryByRole('dialog')).toBeNull()
  act(() => useAppStore.setState({ activeModal: 'add-repo' }))
  await expect(request('open-task-sources', await review())).rejects.toThrow('viewer_modal_open')
  expect(useAppStore.getState().settingsNavigationTarget).toBeNull()
})
it('uses explicit pane keys for multiple mounted panes and rejects a hidden old pane', async () => {
  render(
    <>
      <Harness />
      <Harness />
    </>
  )
  const result = await apply({ kind: 'linear-access-form', action: { kind: 'get' } })
  if (!('linearAccessPanes' in result)) {
    throw new Error('missing panes')
  }
  expect(result.linearAccessPanes).toHaveLength(2)
  expect(new Set(result.linearAccessPanes.map((pane) => pane.paneKey)).size).toBe(2)
  const state = await review()
  act(() => useAppStore.setState({ settingsSearchQuery: 'no matching linear setting' }))
  await expect(request('manage-access', state)).rejects.toThrow('viewer_unavailable')
})
