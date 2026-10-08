// @vitest-environment happy-dom
import { owners, forwarded, select, invoke } from './ssh-ports-viewer-test-fixture'
import { getDefaultSettings } from '../../../../shared/constants'
import { makeFolderWorkspace, makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { SshPortsPanel } from './ssh-ports-panel'
import { applySshPortsViewerRequest } from '@/runtime/ssh-ports-viewer'
it('uses the actual active folder workspace panel and excludes normalized forwarded endpoints', async () => {
  render(<SshPortsPanel />)
  expect(screen.getByText('Service')).toBeVisible()
  const result = await invoke({ viewerId: 7, operation: 'ssh-ports.get', targetId: 'host-a' })
  expect(result).toMatchObject({
    applied: true,
    persisted: null,
    state: { connectionId: 'host-a', forwardCount: 1, detectedCount: 1, dialog: 'closed' }
  })
  expect(JSON.stringify(result)).not.toContain('private-host-canary')
  await expect(
    invoke({ viewerId: 7, operation: 'ssh-ports.edit', targetId: 'host-b', forwardId: 'forward-b' })
  ).rejects.toThrow('ssh_port_target_unavailable')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('opens the same actual edit dialog from native and typed callbacks and closes it without forwarding writes', async () => {
  render(<SshPortsPanel />)
  fireEvent.click(screen.getByTitle('Edit'))
  expect(screen.getByRole('dialog')).toHaveTextContent('Edit Port Forward')
  expect(screen.getByLabelText('Remote Port')).toHaveValue('8080')
  await invoke({ viewerId: 7, operation: 'ssh-ports.cancel', targetId: 'host-a' })
  expect(screen.queryByRole('dialog')).toBeNull()
  await invoke({
    viewerId: 7,
    operation: 'ssh-ports.edit',
    targetId: 'host-a',
    forwardId: 'forward-a'
  })
  expect(screen.getByRole('dialog')).toHaveTextContent('Edit Port Forward')
  expect(screen.getByLabelText('Remote Port')).toHaveValue('8080')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('pins the detected endpoint to its opening SSH host across a workspace switch', async () => {
  render(<SshPortsPanel />)
  fireEvent.click(screen.getByRole('button', { name: /^Forward$/ }))
  expect(screen.getByLabelText('Remote Port')).toHaveValue('443')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await invoke({
    viewerId: 7,
    operation: 'ssh-ports.detected',
    targetId: 'host-a',
    remoteHost: 'private-host-canary',
    remotePort: 443
  })
  expect(screen.getByLabelText('Remote Port')).toHaveValue('443')
  expect(screen.getByLabelText('Local Port')).toHaveValue('10443')
  act(() => select('b'))
  await expect(
    invoke({ viewerId: 7, operation: 'ssh-ports.cancel', targetId: 'host-b' })
  ).rejects.toThrow('ssh_port_dialog_mismatch')
  expect(
    await invoke({ viewerId: 7, operation: 'ssh-ports.cancel', targetId: 'host-a' })
  ).toMatchObject({ applied: true, state: { connectionId: 'host-b', dialog: 'closed' } })
})
it('rejects unknown or deduplicated detected rows and ambiguous panels before opening a form', async () => {
  const view = render(<SshPortsPanel />)
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-ports.detected',
      targetId: 'host-a',
      remoteHost: 'localhost',
      remotePort: 8080
    })
  ).rejects.toThrow('ssh_detected_port_not_found')
  await expect(
    invoke({ viewerId: 7, operation: 'ssh-ports.edit', targetId: 'host-a', forwardId: 'missing' })
  ).rejects.toThrow('ssh_port_forward_not_found')
  view.rerender(
    <>
      <SshPortsPanel />
      <SshPortsPanel />
    </>
  )
  await expect(
    invoke({ viewerId: 7, operation: 'ssh-ports.edit', targetId: 'host-a', forwardId: 'forward-a' })
  ).rejects.toThrow('connections_viewer_ambiguous')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('keeps git worktrees on their host stamp and refuses local or paired folder hosts despite a stale SSH repo hint', async () => {
  useAppStore.setState({
    worktreesByRepo: {
      'repo-a': [makeWorktree({ id: 'git-a', repoId: 'repo-a', hostId: 'ssh:host-a' })]
    },
    activeWorktreeId: 'git-a'
  })
  const view = render(<SshPortsPanel />)
  expect(
    await invoke({ viewerId: 7, operation: 'ssh-ports.get', targetId: 'host-a' })
  ).toMatchObject({ state: { connectionId: 'host-a' } })
  for (const executionHostId of ['local', 'runtime:paired-host'] as const) {
    act(() => {
      useAppStore.setState({
        folderWorkspaces: [
          makeFolderWorkspace({
            id: 'local-folder',
            projectGroupId: 'repo-a',
            folderPath: '/same/path',
            connectionId: 'host-a',
            executionHostId
          })
        ],
        activeWorktreeId: 'folder:local-folder',
        activeWorkspaceExecutionHostId: executionHostId
      })
    })
    await expect(
      invoke({
        viewerId: 7,
        operation: 'ssh-ports.edit',
        targetId: 'host-a',
        forwardId: 'forward-a'
      })
    ).rejects.toThrow('ssh_port_target_unavailable')
    expect(screen.queryByRole('dialog')).toBeNull()
  }
  view.unmount()
})
it('rejects a stale committed workspace scope before its render catches up', async () => {
  render(<SshPortsPanel />)
  let pending: ReturnType<typeof applySshPortsViewerRequest> | undefined
  await act(async () => {
    select('b')
    pending = applySshPortsViewerRequest({
      id: 'scope-race',
      expiresAt: Date.now() + 1000,
      command: {
        viewerId: 7,
        operation: 'ssh-ports.edit',
        targetId: 'host-a',
        forwardId: 'forward-a'
      }
    })
    void pending.catch(() => {})
  })
  await expect(pending).rejects.toThrow('ssh_port_target_unavailable')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('refuses a same-host disconnect before its render commits', async () => {
  render(<SshPortsPanel />)
  let pending: ReturnType<typeof applySshPortsViewerRequest> | undefined
  await act(async () => {
    useAppStore.setState({
      sshConnectionStates: new Map([
        ['host-a', { targetId: 'host-a', status: 'disconnected', error: null, reconnectAttempt: 0 }]
      ])
    })
    pending = applySshPortsViewerRequest({
      id: 'root-disconnect',
      expiresAt: Date.now() + 1000,
      command: {
        viewerId: 7,
        operation: 'ssh-ports.edit',
        targetId: 'host-a',
        forwardId: 'forward-a'
      }
    })
    void pending.catch(() => {})
  })
  await expect(pending).rejects.toThrow('ssh_port_target_unavailable')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('refuses a removed same-host row before its render commits', async () => {
  render(<SshPortsPanel />)
  let pending: ReturnType<typeof applySshPortsViewerRequest> | undefined
  await act(async () => {
    useAppStore.setState({ portForwardsByConnection: { 'host-a': [] } })
    pending = applySshPortsViewerRequest({
      id: 'root-removed-row',
      expiresAt: Date.now() + 1000,
      command: {
        viewerId: 7,
        operation: 'ssh-ports.edit',
        targetId: 'host-a',
        forwardId: 'forward-a'
      }
    })
    void pending.catch(() => {})
  })
  await expect(pending).rejects.toThrow('ssh_port_forward_not_found')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('guards the native edit callback against a row removed before React commits', async () => {
  render(<SshPortsPanel />)
  const edit = screen.getByTitle('Edit')
  act(() => {
    useAppStore.setState({ portForwardsByConnection: { 'host-a': [] } })
    fireEvent.click(edit)
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('refuses a stale detected row after a new canonical forward deduplicates it', async () => {
  render(<SshPortsPanel />)
  let pending: ReturnType<typeof applySshPortsViewerRequest> | undefined
  await act(async () => {
    useAppStore.setState({
      portForwardsByConnection: {
        'host-a': [
          forwarded,
          { ...forwarded, id: 'new-forward', remoteHost: 'private-host-canary', remotePort: 443 }
        ]
      }
    })
    pending = applySshPortsViewerRequest({
      id: 'detected-race',
      expiresAt: Date.now() + 1000,
      command: {
        viewerId: 7,
        operation: 'ssh-ports.detected',
        targetId: 'host-a',
        remoteHost: 'private-host-canary',
        remotePort: 443
      }
    })
    void pending.catch(() => {})
  })
  await expect(pending).rejects.toThrow('ssh_detected_port_not_found')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('copies through the same native row owner and awaits clipboard failure without leaking its address', async () => {
  render(<SshPortsPanel />)
  const copy = screen.getByTitle(/^Copy /)
  copy.focus()
  fireEvent.click(copy, { detail: 0 })
  expect(document.activeElement).toBe(copy)
  await waitFor(() => expect(owners.clipboard).toHaveBeenCalledOnce())
  fireEvent.click(copy, { detail: 1 })
  expect(document.activeElement).not.toBe(copy)
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-ports.copy',
    targetId: 'host-a',
    forwardId: 'forward-a'
  })
  expect(result.applied).toBe(true)
  expect(owners.clipboard).toHaveBeenLastCalledWith('127.0.0.1:18080')
  expect(JSON.stringify(result)).not.toContain('127.0.0.1:18080')
  owners.clipboard.mockRejectedValueOnce(new Error('private-clipboard-canary'))
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.copy',
      targetId: 'host-a',
      forwardId: 'forward-a'
    })
  ).toMatchObject({ applied: false })
})
it('reuses browser preference and explicit system policy while pinning the exact folder workspace', async () => {
  useAppStore.setState({
    settings: { ...getDefaultSettings('/fixture'), openLinksInApp: true }
  })
  render(<SshPortsPanel />)
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-ports.open-browser',
    targetId: 'host-a',
    forwardId: 'forward-a'
  })
  expect(result.applied).toBe(true)
  expect(owners.browser).toHaveBeenCalledExactlyOnceWith({
    workspaceId: 'folder:folder-a',
    url: 'http://127.0.0.1:18080',
    intent: { kind: 'url' }
  })
  expect(owners.shell).not.toHaveBeenCalled()
  await invoke({
    viewerId: 7,
    operation: 'ssh-ports.open-browser',
    targetId: 'host-a',
    forwardId: 'forward-a',
    destination: 'system'
  })
  expect(owners.shell).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:18080')
  owners.browser.mockRejectedValueOnce(new Error('private-browser-canary'))
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.open-browser',
      targetId: 'host-a',
      forwardId: 'forward-a',
      destination: 'orca'
    })
  ).toMatchObject({ applied: false })
})
it('uses the native browser callback with pointer modifier intent and keeps keyboard opens on the preference', async () => {
  useAppStore.setState({
    settings: { ...getDefaultSettings('/fixture'), openLinksInApp: true }
  })
  render(<SshPortsPanel />)
  const open = screen.getByTitle(/in Browser/)
  fireEvent.click(open, { detail: 1, shiftKey: true, ctrlKey: true, metaKey: true })
  await waitFor(() => expect(owners.shell).toHaveBeenCalledOnce())
  fireEvent.click(open, { detail: 0, shiftKey: true, ctrlKey: true, metaKey: true })
  await waitFor(() => expect(owners.browser).toHaveBeenCalledOnce())
})
it('requires exact removal confirmation and waits for canonical row absence', async () => {
  owners.remove.mockImplementation(async () => {
    useAppStore.setState({ portForwardsByConnection: { 'host-a': [] } })
  })
  render(<SshPortsPanel />)
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-ports.remove',
      targetId: 'host-a',
      forwardId: 'forward-a',
      confirmTarget: 'other'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(owners.remove).not.toHaveBeenCalled()
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.remove',
      targetId: 'host-a',
      forwardId: 'forward-a',
      confirmTarget: 'forward-a'
    })
  ).toMatchObject({ applied: true, persisted: null, state: { forwardCount: 0 } })
  expect(owners.remove).toHaveBeenCalledExactlyOnceWith({ id: 'forward-a' })
})
it('prevents sibling native and typed remove requests from writing twice', async () => {
  let finish: (() => void) | undefined
  owners.remove.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => {
          useAppStore.setState({ portForwardsByConnection: { 'host-a': [] } })
          resolve(undefined)
        }
      })
  )
  render(<SshPortsPanel />)
  fireEvent.click(screen.getByTitle('Remove'), { detail: 1 })
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.remove',
      targetId: 'host-a',
      forwardId: 'forward-a',
      confirmTarget: 'forward-a'
    })
  ).toMatchObject({ applied: false })
  expect(owners.remove).toHaveBeenCalledOnce()
  await act(async () => {
    finish?.()
  })
  expect(screen.queryByTitle('Remove')).toBeNull()
})
it('does not mistake another selected host absence for completion of the pinned forward removal', async () => {
  let finish: (() => void) | undefined
  owners.remove.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(undefined)
      })
  )
  render(<SshPortsPanel />)
  let pending: ReturnType<typeof applySshPortsViewerRequest> | undefined
  await act(async () => {
    pending = applySshPortsViewerRequest({
      id: 'remove-host-race',
      expiresAt: Date.now() + 100,
      command: {
        viewerId: 7,
        operation: 'ssh-ports.remove',
        targetId: 'host-a',
        forwardId: 'forward-a',
        confirmTarget: 'forward-a'
      }
    })
    void pending.catch(() => {})
    select('b')
    finish?.()
  })
  await expect(pending).resolves.toMatchObject({ applied: false })
  expect(owners.list).toHaveBeenCalledExactlyOnceWith({ targetId: 'host-a' })
  expect(useAppStore.getState().portForwardsByConnection['host-a']).toHaveLength(1)
  expect(owners.remove).toHaveBeenCalledOnce()
})

it('rejects renderer cache absence while the canonical pinned forward still exists', async () => {
  owners.remove.mockImplementation(async () => {
    useAppStore.setState({ portForwardsByConnection: { 'host-a': [] } })
  })
  owners.list.mockResolvedValue([forwarded])
  render(<SshPortsPanel />)
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.remove',
      targetId: 'host-a',
      forwardId: 'forward-a',
      confirmTarget: 'forward-a'
    })
  ).toMatchObject({ applied: false })
  expect(owners.list).toHaveBeenCalledExactlyOnceWith({ targetId: 'host-a' })
})
it('does not acknowledge a failed canonical forward read and ignores another host with the same forward id', async () => {
  owners.remove.mockImplementation(async () => {
    useAppStore.setState({ portForwardsByConnection: { 'host-a': [] } })
  })
  owners.list.mockRejectedValueOnce(new Error('private-forward-read-canary'))
  const view = render(<SshPortsPanel />)
  const failed = await invoke({
    viewerId: 7,
    operation: 'ssh-ports.remove',
    targetId: 'host-a',
    forwardId: 'forward-a',
    confirmTarget: 'forward-a'
  })
  expect(failed.applied).toBe(false)
  expect(JSON.stringify(failed)).not.toContain('private-forward-read-canary')
  act(() => useAppStore.setState({ portForwardsByConnection: { 'host-a': [forwarded] } }))
  owners.list.mockResolvedValueOnce([{ ...forwarded, connectionId: 'host-b' }])
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.remove',
      targetId: 'host-a',
      forwardId: 'forward-a',
      confirmTarget: 'forward-a'
    })
  ).toMatchObject({ applied: true })
  view.unmount()
})

it('refuses stale native copy and remove after the active workspace changes before rendering', async () => {
  render(<SshPortsPanel />)
  const remove = screen.getByTitle('Remove')
  const copy = screen.getByTitle(/^Copy /)
  await act(async () => {
    select('b')
    fireEvent.click(copy, { detail: 1 })
    fireEvent.click(remove, { detail: 1 })
  })
  expect(owners.clipboard).not.toHaveBeenCalled()
  expect(owners.remove).not.toHaveBeenCalled()
  expect(owners.list).not.toHaveBeenCalled()
  expect(useAppStore.getState().portForwardsByConnection['host-a']).toHaveLength(1)
})

it('keeps a saved port form open until the exact canonical entry is confirmed', async () => {
  owners.update.mockResolvedValue(forwarded)
  owners.list.mockResolvedValue([{ ...forwarded, remotePort: 9999 }])
  render(<SshPortsPanel />)
  fireEvent.click(screen.getByTitle('Edit'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(owners.list).toHaveBeenCalledWith({ targetId: 'host-a' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
it('keeps a port form open on canonical read failure without displaying a private error', async () => {
  owners.update.mockResolvedValue(forwarded)
  owners.list.mockRejectedValue(new Error('private-port-save-canary'))
  render(<SshPortsPanel />)
  fireEvent.click(screen.getByTitle('Edit'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(owners.list).toHaveBeenCalledOnce())
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('private-port-save-canary')
})
it('submits the same native form once and does not close a new dialog after cancellation', async () => {
  let finish: ((value: typeof forwarded) => void) | undefined
  owners.update.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  render(<SshPortsPanel />)
  fireEvent.click(screen.getByTitle('Edit'))
  const form = screen.getByRole('button', { name: 'Save' }).closest('form')
  if (!form) {
    throw new Error('missing_form')
  }
  act(() => {
    fireEvent.submit(form)
    fireEvent.submit(form)
  })
  expect(owners.update).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByTitle('Edit'))
  await act(async () => {
    finish?.(forwarded)
  })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
it('closes only after exact canonical add and preserves digit sanitizing and privileged-port remapping', async () => {
  const created = {
    ...forwarded,
    id: 'created',
    remotePort: 443,
    localPort: 10443,
    remoteHost: 'localhost',
    label: undefined
  }
  owners.add.mockResolvedValue(created)
  owners.list.mockResolvedValue([created])
  render(<SshPortsPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  fireEvent.change(screen.getByLabelText('Remote Port'), { target: { value: '4x43' } })
  expect(screen.getByLabelText('Remote Port')).toHaveValue('443')
  expect(screen.getByLabelText('Local Port')).toHaveValue('10443')
  fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(owners.add).toHaveBeenCalledExactlyOnceWith({
    targetId: 'host-a',
    remotePort: 443,
    localPort: 10443,
    remoteHost: 'localhost',
    label: undefined
  })
  expect(owners.list).toHaveBeenCalledExactlyOnceWith({ targetId: 'host-a' })
})

it('uses the same native digit filter and private typed draft to save exact canonical fields', async () => {
  render(<SshPortsPanel />)
  await invoke({
    viewerId: 7,
    operation: 'ssh-ports.edit',
    targetId: 'host-a',
    forwardId: 'forward-a'
  })
  const draft = await invoke({
    viewerId: 7,
    operation: 'ssh-ports.draft',
    targetId: 'host-a',
    draft: {
      remotePort: '4x43',
      localPort: '1x0443',
      remoteHost: 'private-form-host-canary',
      label: 'private-form-label-canary'
    }
  })
  expect(draft).toMatchObject({ applied: true, persisted: null })
  expect(JSON.stringify(draft)).not.toContain('private-form')
  expect(screen.getByLabelText('Remote Port')).toHaveValue('443')
  expect(screen.getByLabelText('Local Port')).toHaveValue('10443')
  expect(screen.getByLabelText('Remote Host')).toHaveValue('private-form-host-canary')
  const canonical = {
    ...forwarded,
    remotePort: 443,
    localPort: 10443,
    remoteHost: 'private-form-host-canary',
    label: 'private-form-label-canary'
  }
  owners.update.mockResolvedValue(canonical)
  owners.list.mockResolvedValue([canonical])
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.save',
      targetId: 'host-a',
      confirmTarget: 'host-a'
    })
  ).toMatchObject({ applied: true, persisted: true, state: { dialog: 'closed' } })
  expect(owners.update).toHaveBeenCalledExactlyOnceWith({
    id: 'forward-a',
    targetId: 'host-a',
    remotePort: 443,
    localPort: 10443,
    remoteHost: canonical.remoteHost,
    label: canonical.label
  })
})
it('requires exact save confirmation and pins the original dialog target across workspace switches', async () => {
  render(<SshPortsPanel />)
  await invoke({
    viewerId: 7,
    operation: 'ssh-ports.edit',
    targetId: 'host-a',
    forwardId: 'forward-a'
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-ports.save',
      targetId: 'host-a',
      confirmTarget: 'host-b'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(owners.update).not.toHaveBeenCalled()
  act(() => select('b'))
  owners.update.mockResolvedValue(forwarded)
  owners.list.mockResolvedValue([forwarded])
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.save',
      targetId: 'host-a',
      confirmTarget: 'host-a'
    })
  ).toMatchObject({ applied: true, persisted: true })
  expect(owners.update.mock.calls[0][0]).toMatchObject({ targetId: 'host-a', id: 'forward-a' })
})
it('does not accept a different saved id for an edit or discard a newer same-dialog draft', async () => {
  render(<SshPortsPanel />)
  await invoke({
    viewerId: 7,
    operation: 'ssh-ports.edit',
    targetId: 'host-a',
    forwardId: 'forward-a'
  })
  owners.update.mockResolvedValue({ ...forwarded, id: 'wrong-id' })
  owners.list.mockResolvedValue([{ ...forwarded, id: 'wrong-id' }])
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.save',
      targetId: 'host-a',
      confirmTarget: 'host-a'
    })
  ).toMatchObject({ applied: false, persisted: false })
  let finish: ((value: typeof forwarded) => void) | undefined
  owners.update.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  owners.list.mockResolvedValue([forwarded])
  let pending: ReturnType<typeof applySshPortsViewerRequest> | undefined
  act(() => {
    pending = applySshPortsViewerRequest({
      id: 'save-revision',
      expiresAt: Date.now() + 1000,
      command: {
        viewerId: 7,
        operation: 'ssh-ports.save',
        targetId: 'host-a',
        confirmTarget: 'host-a'
      }
    })
  })
  fireEvent.change(screen.getByLabelText(/^Label/), { target: { value: 'New draft' } })
  await act(async () => {
    finish?.(forwarded)
  })
  await expect(pending).resolves.toMatchObject({ applied: false, persisted: false })
  expect(screen.getByLabelText(/^Label/)).toHaveValue('New draft')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
it('shares the synchronous native and typed save guard and rejects disconnected pinned targets', async () => {
  let finish: ((value: typeof forwarded) => void) | undefined
  owners.update.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  owners.list.mockResolvedValue([forwarded])
  render(<SshPortsPanel />)
  await invoke({
    viewerId: 7,
    operation: 'ssh-ports.edit',
    targetId: 'host-a',
    forwardId: 'forward-a'
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-ports.save',
      targetId: 'host-a',
      confirmTarget: 'host-a'
    })
  ).toMatchObject({ applied: false, persisted: false })
  expect(owners.update).toHaveBeenCalledOnce()
  await act(async () => {
    finish?.(forwarded)
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await invoke({
    viewerId: 7,
    operation: 'ssh-ports.edit',
    targetId: 'host-a',
    forwardId: 'forward-a'
  })
  act(() => useAppStore.setState({ sshConnectionStates: new Map() }))
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-ports.save',
      targetId: 'host-a',
      confirmTarget: 'host-a'
    })
  ).rejects.toThrow('ssh_port_dialog_mismatch')
  expect(owners.update).toHaveBeenCalledOnce()
})

it('root preserves a newer draft in the same dialog after an earlier save completes', async () => {
  let finish: ((value: typeof forwarded) => void) | undefined
  owners.update.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  owners.list.mockResolvedValue([forwarded])
  render(<SshPortsPanel />)
  fireEvent.click(screen.getByTitle('Edit'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  fireEvent.change(screen.getByLabelText(/^Label/), {
    target: { value: 'newer-private-label-canary' }
  })
  await act(async () => {
    finish?.(forwarded)
  })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByLabelText(/^Label/)).toHaveValue('newer-private-label-canary')
  expect(owners.update).toHaveBeenCalledOnce()
})
