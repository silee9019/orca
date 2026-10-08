// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SshPane } from './SshPane'
import { TooltipProvider } from '../ui/tooltip'
import { useAppStore } from '@/store'
import { applySshConfirmationViewerRequest } from '@/runtime/ssh-confirmation-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import { SSH_TERMINATE_RECONNECT_REQUIRED } from '../../../../shared/constants'
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const target = {
  id: 'host-a',
  label: 'Host A',
  host: 'private-host-canary',
  username: 'fixture',
  port: 22
}
const terminate = vi.fn(),
  connect = vi.fn(),
  reset = vi.fn(),
  remove = vi.fn(),
  listTargets = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ recordFeatureInteraction: vi.fn() })
  terminate.mockResolvedValue({ terminated: 0, unverifiable: 2 })
  connect.mockResolvedValue(undefined)
  reset.mockResolvedValue(undefined)
  listTargets.mockResolvedValue([target])
  remove.mockImplementation(async () => {
    listTargets.mockResolvedValue([])
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ssh: {
        listTargets,
        importConfig: vi.fn().mockResolvedValue({ targets: [], repoReadoptions: [] }),
        terminateSessions: terminate,
        connect,
        resetRelay: reset,
        removeTarget: remove
      }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
async function invoke(command: ConnectionsViewerCommand) {
  let pending
  await act(async () => {
    pending = applySshConfirmationViewerRequest({
      id: 'fixture',
      expiresAt: Date.now() + 1000,
      command
    })
    void pending.catch(() => {})
  })
  return pending
}
async function mount() {
  render(
    <TooltipProvider>
      <SshPane />
    </TooltipProvider>
  )
  await waitFor(() => expect(screen.getByText('Host A')).toBeVisible())
}
it('uses the actual SSH pane parent to reconnect then terminate while retaining offline unverifiable counts', async () => {
  terminate.mockRejectedValueOnce(new Error(SSH_TERMINATE_RECONNECT_REQUIRED))
  await mount()
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'terminate',
    targetId: 'host-a'
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'terminate',
    confirmTarget: 'host-a'
  })
  expect(result).toMatchObject({ applied: true, termination: { terminated: 0, unverifiable: 2 } })
  expect(terminate).toHaveBeenCalledTimes(2)
  expect(connect).toHaveBeenCalledExactlyOnceWith({ targetId: 'host-a' })
  expect(toast.warning).toHaveBeenCalledOnce()
  expect(toast.success).not.toHaveBeenCalled()
  expect(JSON.stringify(result)).not.toContain('private-host-canary')
})
it('uses the actual reset owner and reports its failure without a successful action ack', async () => {
  reset.mockRejectedValueOnce(new Error('private-reset-error-canary'))
  await mount()
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'reset',
    targetId: 'host-a'
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'reset',
    confirmTarget: 'host-a'
  })
  expect(reset).toHaveBeenCalledExactlyOnceWith({ targetId: 'host-a' })
  expect(result).toMatchObject({
    applied: false,
    reason: 'ssh_action_failed',
    state: { resetTargetId: null }
  })
  expect(JSON.stringify(result)).not.toContain('private-reset-error-canary')
})

it('removes the plain target after failed cleanup and clears its renderer metadata through the actual parent', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  terminate.mockRejectedValueOnce(new Error(SSH_TERMINATE_RECONNECT_REQUIRED))
  connect.mockRejectedValueOnce(new Error('private-offline-cleanup-canary'))
  await mount()
  useAppStore.setState({ remoteWorkspaceHydratedTargetIds: new Set(['host-a']) })
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'remove',
    targetId: 'host-a'
  })
  expect(screen.getByRole('dialog')).toHaveTextContent('Remove SSH Target')
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'remove',
    confirmTarget: 'host-a'
  })
  expect(result).toMatchObject({
    applied: true,
    state: { removeTargetId: null, workspaceRemoval: false }
  })
  expect(remove).toHaveBeenCalledExactlyOnceWith({ id: 'host-a' })
  expect(connect).toHaveBeenCalledTimes(1)
  expect(useAppStore.getState().remoteWorkspaceHydratedTargetIds.has('host-a')).toBe(false)
  expect(useAppStore.getState().sshTargetLabels.has('host-a')).toBe(false)
  expect(JSON.stringify(result)).not.toContain('private-offline-cleanup-canary')
  expect(screen.queryByRole('dialog')).toBeNull()
  warning.mockRestore()
})
it('does not acknowledge metadata removal failure as applied', async () => {
  remove.mockRejectedValueOnce(new Error('private-remove-error-canary'))
  await mount()
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'remove',
    targetId: 'host-a'
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'remove',
    confirmTarget: 'host-a'
  })
  expect(result).toMatchObject({ applied: false, reason: 'ssh_action_failed' })
  expect(useAppStore.getState().sshTargetLabels.has('host-a')).toBe(true)
  expect(JSON.stringify(result)).not.toContain('private-remove-error-canary')
})

it('routes a folder workspace host through the original workspace-aware dialog and refuses the plain removal shortcut', async () => {
  useAppStore.setState({
    repos: [
      {
        id: 'folder-project',
        path: '/fixture/folder',
        displayName: 'Folder',
        badgeColor: '',
        addedAt: 1,
        kind: 'folder',
        connectionId: 'host-a'
      }
    ]
  })
  await mount()
  const requested = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'remove',
    targetId: 'host-a'
  })
  expect(requested).toMatchObject({
    applied: true,
    state: { removeTargetId: 'host-a', workspaceRemoval: true }
  })
  expect(screen.getByRole('dialog')).toHaveTextContent('1 workspace')
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.confirm',
      kind: 'remove',
      confirmTarget: 'host-a'
    })
  ).rejects.toThrow('ssh_workspace_removal_confirmation_required')
  expect(remove).not.toHaveBeenCalled()
  expect(terminate).not.toHaveBeenCalled()
  expect(useAppStore.getState().repos).toHaveLength(1)
})

it('does not acknowledge removal when the canonical refresh still contains the target', async () => {
  remove.mockResolvedValueOnce(undefined)
  await mount()
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'remove',
    targetId: 'host-a'
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'remove',
    confirmTarget: 'host-a'
  })
  expect(result).toMatchObject({ applied: false, reason: 'ssh_action_failed' })
  expect(screen.getByText('Host A')).toBeVisible()
  expect(remove).toHaveBeenCalledOnce()
})
it('does not acknowledge removal when its canonical refresh fails', async () => {
  await mount()
  listTargets.mockRejectedValueOnce(new Error('private-refresh-error-canary'))
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'remove',
    targetId: 'host-a'
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'remove',
    confirmTarget: 'host-a'
  })
  expect(result).toMatchObject({ applied: false, reason: 'ssh_action_failed' })
  expect(JSON.stringify(result)).not.toContain('private-refresh-error-canary')
  expect(remove).toHaveBeenCalledOnce()
})

function folderHost() {
  useAppStore.setState({
    repos: [
      {
        id: 'folder-project',
        path: '/fixture/folder',
        displayName: 'Folder',
        badgeColor: '',
        addedAt: 1,
        kind: 'folder',
        connectionId: 'host-a'
      }
    ],
    updateSettings: vi.fn().mockResolvedValue(undefined)
  })
}
async function requestWorkspaceRemoval() {
  await mount()
  return invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'remove',
    targetId: 'host-a'
  })
}
it('keeps folder workspaces by default and verifies canonical target absence before closing', async () => {
  folderHost()
  await requestWorkspaceRemoval()
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'remove',
    confirmTarget: 'host-a',
    workspaceDisposition: 'keep'
  })
  expect(result).toMatchObject({ applied: true, state: { removeTargetId: null } })
  expect(remove).toHaveBeenCalledOnce()
  expect(useAppStore.getState().repos).toHaveLength(1)
  expect(useAppStore.getState().updateSettings).toHaveBeenCalledOnce()
})
it('cancels the original workspace dialog without deleting the host', async () => {
  folderHost()
  await requestWorkspaceRemoval()
  const result = await invoke({ viewerId: 7, operation: 'ssh-confirmation.cancel', kind: 'remove' })
  expect(result).toMatchObject({ applied: true, state: { removeTargetId: null } })
  expect(remove).not.toHaveBeenCalled()
})
it('keeps the workspace dialog open when canonical target absence cannot be verified', async () => {
  folderHost()
  remove.mockResolvedValueOnce(undefined)
  await requestWorkspaceRemoval()
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'remove',
    confirmTarget: 'host-a',
    workspaceDisposition: 'keep'
  })
  expect(result).toMatchObject({ applied: false, state: { removeTargetId: 'host-a' } })
  expect(screen.getByRole('dialog')).toBeVisible()
})
it('requires the exact current workspace disposition and stops after partial cleanup failure', async () => {
  folderHost()
  const removeProject = vi.fn().mockResolvedValue(undefined)
  useAppStore.setState({ removeProject })
  await requestWorkspaceRemoval()
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.remove-options',
    confirmTarget: 'host-a',
    advancedOpen: true,
    deleteWorkspaces: true
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.confirm',
      kind: 'remove',
      confirmTarget: 'host-a',
      workspaceDisposition: 'delete-remote'
    })
  ).rejects.toThrow('workspace_disposition_mismatch')
  expect(removeProject).not.toHaveBeenCalled()
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'remove',
    confirmTarget: 'host-a',
    workspaceDisposition: 'forget-local'
  })
  expect(result).toMatchObject({ applied: false, state: { removeTargetId: 'host-a' } })
  expect(removeProject).toHaveBeenCalledExactlyOnceWith('folder-project', { hostId: 'ssh:host-a' })
  expect(remove).not.toHaveBeenCalled()
})
it('forgets the disconnected folder through the existing host-scoped owner before removing the target', async () => {
  folderHost()
  const removeProject = vi.fn().mockImplementation(async () => {
    useAppStore.setState({ repos: [] })
  })
  useAppStore.setState({ removeProject })
  await requestWorkspaceRemoval()
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.remove-options',
    confirmTarget: 'host-a',
    advancedOpen: true,
    deleteWorkspaces: true
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'remove',
    confirmTarget: 'host-a',
    workspaceDisposition: 'forget-local'
  })
  expect(result.applied).toBe(true)
  expect(removeProject).toHaveBeenCalledExactlyOnceWith('folder-project', { hostId: 'ssh:host-a' })
  expect(remove).toHaveBeenCalledOnce()
})

it('executes the explicitly confirmed connected policy through the existing host owner', async () => {
  folderHost()
  const removeProject = vi.fn().mockImplementation(async () => {
    useAppStore.setState({ repos: [] })
  })
  useAppStore.setState({
    removeProject,
    sshConnectionStates: new Map([
      ['host-a', { targetId: 'host-a', status: 'connected', error: null, reconnectAttempt: 0 }]
    ])
  })
  await requestWorkspaceRemoval()
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.remove-options',
    confirmTarget: 'host-a',
    advancedOpen: true,
    deleteWorkspaces: true
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'remove',
    confirmTarget: 'host-a',
    workspaceDisposition: 'delete-remote'
  })
  expect(result.applied).toBe(true)
  expect(removeProject).toHaveBeenCalledExactlyOnceWith('folder-project', { hostId: 'ssh:host-a' })
  expect(remove).toHaveBeenCalledOnce()
})
it('does not silently change the confirmed connected policy after a synchronous disconnect', async () => {
  folderHost()
  const removeProject = vi.fn()
  useAppStore.setState({
    removeProject,
    sshConnectionStates: new Map([
      ['host-a', { targetId: 'host-a', status: 'connected', error: null, reconnectAttempt: 0 }]
    ])
  })
  await requestWorkspaceRemoval()
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.remove-options',
    confirmTarget: 'host-a',
    advancedOpen: true,
    deleteWorkspaces: true
  })
  let result
  await act(async () => {
    useAppStore.setState({ sshConnectionStates: new Map() })
    result = await applySshConfirmationViewerRequest({
      id: 'race',
      expiresAt: Date.now() + 1000,
      command: {
        viewerId: 7,
        operation: 'ssh-confirmation.confirm',
        kind: 'remove',
        confirmTarget: 'host-a',
        workspaceDisposition: 'delete-remote'
      }
    })
  })
  expect(result).toMatchObject({ applied: false })
  expect(removeProject).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
})

import { applySshConnectionsViewerRequest } from '@/runtime/ssh-connections-viewer-controller'
async function invokeSshForm(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applySshConnectionsViewerRequest> | undefined
  await act(async () => {
    pending = applySshConnectionsViewerRequest({
      id: 'root-settings-save',
      expiresAt: Date.now() + 1000,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('fixture_request_missing')
  }
  return pending
}
it('settings save refuses a new target absent from the canonical refreshed list', async () => {
  const saved = { ...target, id: 'new-host', label: 'New host', host: 'new-fixture.example' }
  window.api.ssh.addTarget = vi.fn().mockResolvedValue({ target: saved, repoReadoptions: [] })
  await mount()
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-open' })
  await invokeSshForm({
    viewerId: 7,
    operation: 'ssh.form-draft',
    updates: { host: saved.host, label: saved.label }
  })
  expect(await invokeSshForm({ viewerId: 7, operation: 'ssh.form-save' })).toMatchObject({
    applied: false,
    persisted: false
  })
  expect(window.api.ssh.addTarget).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(toast.success).not.toHaveBeenCalled()
})

it('settings edit refuses stale canonical fields on the same target ID', async () => {
  window.api.ssh.updateTarget = vi.fn().mockResolvedValue(undefined)
  await mount()
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-edit', targetId: target.id })
  await invokeSshForm({
    viewerId: 7,
    operation: 'ssh.form-draft',
    updates: { host: 'changed-fixture.example' }
  })
  expect(await invokeSshForm({ viewerId: 7, operation: 'ssh.form-save' })).toMatchObject({
    applied: false,
    persisted: false
  })
  expect(window.api.ssh.updateTarget).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(toast.success).not.toHaveBeenCalled()
})
it('settings save refuses a failed canonical list refresh', async () => {
  const saved = { ...target, id: 'new-host', label: 'New host', host: 'new-fixture.example' }
  window.api.ssh.addTarget = vi.fn().mockResolvedValue({ target: saved, repoReadoptions: [] })
  await mount()
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-open' })
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-draft', updates: { host: saved.host } })
  listTargets.mockRejectedValueOnce(new Error('private-readback-canary'))
  const result = await invokeSshForm({ viewerId: 7, operation: 'ssh.form-save' })
  expect(result).toMatchObject({ applied: false, persisted: false })
  expect(JSON.stringify(result)).not.toContain('canary')
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(toast.success).not.toHaveBeenCalled()
})

it('acknowledges the exact canonical created payload before closing the settings form', async () => {
  window.api.ssh.addTarget = vi.fn().mockImplementation(async ({ target: payload }) => {
    const saved = { ...payload, id: 'new-host' }
    listTargets.mockResolvedValue([target, saved])
    return { target: saved, repoReadoptions: [] }
  })
  await mount()
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-open' })
  await invokeSshForm({
    viewerId: 7,
    operation: 'ssh.form-draft',
    updates: { host: 'new.example', proxyCommand: 'private-proxy-canary' }
  })
  const result = await invokeSshForm({ viewerId: 7, operation: 'ssh.form-save' })
  expect(result).toMatchObject({ applied: true, persisted: true, state: { formOpen: false } })
  expect(toast.success).toHaveBeenCalledOnce()
  expect(JSON.stringify(result)).not.toContain('private-proxy-canary')
})
it('acknowledges canonical edited fields including cleared optional fields', async () => {
  window.api.ssh.updateTarget = vi.fn().mockImplementation(async ({ id, updates }) => {
    listTargets.mockResolvedValue([{ ...target, ...updates, id }])
  })
  await mount()
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-edit', targetId: target.id })
  await invokeSshForm({
    viewerId: 7,
    operation: 'ssh.form-draft',
    updates: { host: 'changed.example', identityFile: '', proxyCommand: '' }
  })
  expect(await invokeSshForm({ viewerId: 7, operation: 'ssh.form-save' })).toMatchObject({
    applied: true,
    persisted: true
  })
  expect(window.api.ssh.updateTarget).toHaveBeenCalledOnce()
})
it('gates sibling native submits synchronously before React commits saving', async () => {
  let complete: (() => void) | undefined
  window.api.ssh.addTarget = vi.fn().mockImplementation(
    ({ target: payload }) =>
      new Promise((resolve) => {
        complete = () => {
          const saved = { ...payload, id: 'new-host' }
          listTargets.mockResolvedValue([saved])
          resolve({ target: saved, repoReadoptions: [] })
        }
      })
  )
  await mount()
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-open' })
  await invokeSshForm({
    viewerId: 7,
    operation: 'ssh.form-draft',
    updates: { host: 'new.example' }
  })
  const form = screen.getByRole('dialog').querySelector('form')
  if (!form) {
    throw new Error('fixture_form_missing')
  }
  act(() => {
    fireEvent.submit(form)
    fireEvent.submit(form)
  })
  expect(window.api.ssh.addTarget).toHaveBeenCalledOnce()
  await act(async () => {
    complete?.()
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})
it('retains a new settings form when an older native save finishes', async () => {
  let complete: (() => void) | undefined
  window.api.ssh.addTarget = vi.fn().mockImplementation(
    ({ target: payload }) =>
      new Promise((resolve) => {
        complete = () => {
          const saved = { ...payload, id: 'new-host' }
          listTargets.mockResolvedValue([saved])
          resolve({ target: saved, repoReadoptions: [] })
        }
      })
  )
  const view = render(
    <TooltipProvider>
      <SshPane />
    </TooltipProvider>
  )
  await waitFor(() => expect(screen.getByText('Host A')).toBeVisible())
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-open' })
  await invokeSshForm({
    viewerId: 7,
    operation: 'ssh.form-draft',
    updates: { host: 'old.example' }
  })
  const form = screen.getByRole('dialog').querySelector('form')
  if (!form) {
    throw new Error('fixture_form_missing')
  }
  act(() => {
    fireEvent.submit(form)
  })
  view.rerender(
    <TooltipProvider>
      <SshPane addTargetIntentSignal={1} />
    </TooltipProvider>
  )
  await act(async () => {
    complete?.()
  })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByRole('dialog').querySelector('#ssh-target-host')).toHaveValue('')
  expect(toast.success).not.toHaveBeenCalled()
})
it('shares native settings form fields, Advanced disclosure and cancel with the typed parent actions', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Add Target' }))
  expect(await invokeSshForm({ viewerId: 7, operation: 'ssh.get' })).toMatchObject({
    state: { formOpen: true, editingId: null }
  })
  for (const [label, value] of [
    ['Label', 'Settings host'],
    ['Host or alias *', 'native.example'],
    ['Username', 'deploy'],
    ['Port', '2202'],
    ['Identity File', 'private-identity-canary']
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
    expect(screen.getByLabelText(label)).toHaveValue(label === 'Port' ? Number(value) : value)
  }
  fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
  expect(await invokeSshForm({ viewerId: 7, operation: 'ssh.get' })).toMatchObject({
    state: { advancedOpen: true, configured: { host: true, username: true, identityFile: true } }
  })
  fireEvent.change(screen.getByLabelText('Proxy Command'), {
    target: { value: 'private-proxy-canary' }
  })
  expect(await invokeSshForm({ viewerId: 7, operation: 'ssh.get' })).toMatchObject({
    state: { configured: { proxyCommand: true } }
  })
  await invokeSshForm({
    viewerId: 7,
    operation: 'ssh.form-draft',
    updates: {
      label: 'Typed host',
      host: 'typed.example',
      username: 'typed-user',
      port: '2222',
      identityFile: 'typed-identity-canary',
      proxyCommand: 'typed-proxy-canary'
    }
  })
  expect(screen.getByLabelText('Host or alias *')).toHaveValue('typed.example')
  expect(screen.getByLabelText('Identity File')).toHaveValue('typed-identity-canary')
  expect(screen.getByLabelText('Proxy Command')).toHaveValue('typed-proxy-canary')
  await invokeSshForm({ viewerId: 7, operation: 'ssh.advanced', open: false })
  expect(screen.queryByLabelText('Proxy Command')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(await invokeSshForm({ viewerId: 7, operation: 'ssh.get' })).toMatchObject({
    state: { formOpen: false, editingId: null }
  })
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-open' })
  expect(screen.getByLabelText('Host or alias *')).toHaveValue('')
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-cancel' })
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('prevents the native settings submit default and awaits the same canonical save as the typed action', async () => {
  window.api.ssh.addTarget = vi.fn().mockImplementation(async ({ target: payload }) => {
    const saved = { ...payload, id: 'native-saved' }
    listTargets.mockResolvedValue([target, saved])
    return { target: saved, repoReadoptions: [] }
  })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Add Target' }))
  fireEvent.change(screen.getByLabelText('Host or alias *'), {
    target: { value: 'native.example' }
  })
  const form = screen.getByRole('dialog').querySelector('form')
  if (!form) {
    throw new Error('fixture_form_missing')
  }
  const event = new Event('submit', { bubbles: true, cancelable: true })
  await act(async () => {
    form.dispatchEvent(event)
  })
  expect(event.defaultPrevented).toBe(true)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(window.api.ssh.addTarget).toHaveBeenCalledOnce()
  expect(useAppStore.getState().sshTargetLabels.get('native-saved')).toBeTruthy()
  expect(toast.success).toHaveBeenCalledOnce()
})

it('does not claim a three hour timeout persisted when an older owner drops the unsupported explicit value', async () => {
  window.api.ssh.addTarget = vi.fn().mockImplementation(async ({ target: payload }) => {
    const saved = { ...payload, id: 'old-owner' }
    delete saved.relayGracePeriodSeconds
    listTargets.mockResolvedValue([target, saved])
    return { target: saved, repoReadoptions: [] }
  })
  await mount()
  await invokeSshForm({ viewerId: 7, operation: 'ssh.form-open' })
  await invokeSshForm({
    viewerId: 7,
    operation: 'ssh.form-draft',
    updates: {
      host: 'fixture.example',
      relayKeepAliveUntilReset: false,
      relayGracePeriodSeconds: '10800'
    }
  })
  expect(await invokeSshForm({ viewerId: 7, operation: 'ssh.form-save' })).toMatchObject({
    applied: false,
    persisted: false
  })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(toast.success).not.toHaveBeenCalled()
})
