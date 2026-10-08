// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SshConfigHostResolution } from '../../../../shared/ssh-types'

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), toastMocks) }))

const storeActions = vi.hoisted(() => ({
  setSshTargetsMetadata: vi.fn(),
  recordSshRepoReadoptions: vi.fn(),
  setRuntimeEnvironments: vi.fn(),
  setRuntimeEnvironmentStatus: vi.fn(),
  recordFeatureInteraction: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(storeActions)
}))

import { AddRemoteHostDialog } from './AddRemoteHostDialog'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function resolution(alias: string, hostname: string): SshConfigHostResolution {
  return {
    alias,
    hostname,
    port: 22,
    username: 'deploy',
    identityFiles: [],
    identitiesOnly: false,
    forwardAgent: false,
    proxyUseFdpass: false
  }
}

const listConfigHosts = vi.fn()
const resolveConfigHost = vi.fn()
const importConfig = vi.fn()
const listTargets = vi.fn()

function configHost(
  alias: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    alias,
    hostname: `${alias}.internal`,
    port: 22,
    username: 'deploy',
    alreadyInOrca: false,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  listConfigHosts.mockResolvedValue({
    hosts: [configHost('alpha'), configHost('bravo')],
    totalHostCount: 2,
    newHostCount: 2,
    matchCount: 2,
    hasMore: false
  })
  importConfig.mockResolvedValue({ targets: [], repoReadoptions: [] })
  listTargets.mockResolvedValue([])
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ssh: { listConfigHosts, resolveConfigHost, importConfig, listTargets } }
  })
})

afterEach(() => {
  cleanup()
})

async function openPicker(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<AddRemoteHostDialog mode="ssh" onOpenChange={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /Fill from/ }))
  await screen.findByRole('button', { name: /alpha/ })
  return user
}

async function openPickerWith(result: Record<string, unknown>): Promise<void> {
  listConfigHosts.mockResolvedValue({ hasMore: false, ...result })
  const user = userEvent.setup()
  render(<AddRemoteHostDialog mode="ssh" onOpenChange={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /Fill from/ }))
}

describe('SSH config picker host selection', () => {
  it('drops a resolve that lands after the user backs out of the picker', async () => {
    const pending = deferred<SshConfigHostResolution>()
    resolveConfigHost.mockReturnValueOnce(pending.promise)
    const user = await openPicker()

    await user.click(screen.getByRole('button', { name: /alpha/ }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    pending.resolve(resolution('alpha', 'alpha.internal'))
    await waitFor(() => expect(screen.getByLabelText('Host or alias')).toBeDefined())

    expect((screen.getByLabelText('Host or alias') as HTMLInputElement).value).toBe('')
    expect(toastMocks.success).not.toHaveBeenCalled()
  })

  it('keeps the host the user settled on when an earlier resolve lands late', async () => {
    const slowAlpha = deferred<SshConfigHostResolution>()
    resolveConfigHost.mockReturnValueOnce(slowAlpha.promise)
    resolveConfigHost.mockResolvedValueOnce(resolution('bravo', 'bravo.internal'))
    const user = await openPicker()

    await user.click(screen.getByRole('button', { name: /alpha/ }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: /Fill from/ }))
    await user.click(await screen.findByRole('button', { name: /bravo/ }))
    await waitFor(() =>
      expect((screen.getByLabelText('Host or alias') as HTMLInputElement).value).toBe(
        'bravo.internal'
      )
    )

    await act(async () => {
      slowAlpha.resolve(resolution('alpha', 'alpha.internal'))
      await slowAlpha.promise
    })

    expect((screen.getByLabelText('Host or alias') as HTMLInputElement).value).toBe(
      'bravo.internal'
    )
  })

  it('freezes the other rows while a pick is resolving', async () => {
    const pending = deferred<SshConfigHostResolution>()
    resolveConfigHost.mockReturnValueOnce(pending.promise)
    const user = await openPicker()

    await user.click(screen.getByRole('button', { name: /alpha/ }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /bravo/ }).hasAttribute('disabled')).toBe(true)
    )
    await act(async () => {
      pending.resolve(resolution('alpha', 'alpha.internal'))
      await pending.promise
    })
  })
})

describe('SSH config picker tombstoned hosts', () => {
  it('keeps a previously removed host pickable while an adopted one stays disabled', async () => {
    await openPickerWith({
      hosts: [
        configHost('removed', { previouslyRemoved: true }),
        configHost('kept', { alreadyInOrca: true })
      ],
      totalHostCount: 2,
      newHostCount: 0,
      matchCount: 2
    })

    const removed = await screen.findByRole('button', { name: /removed/ })
    expect(removed.hasAttribute('disabled')).toBe(false)
    expect(removed.textContent).toContain('Removed from Orca')

    const kept = screen.getByRole('button', { name: /kept/ })
    expect(kept.hasAttribute('disabled')).toBe(true)
    expect(kept.textContent).toContain('In Orca')
  })

  it('never claims the config is empty when every host is only tombstoned', async () => {
    await openPickerWith({
      hosts: [configHost('removed', { previouslyRemoved: true })],
      totalHostCount: 1,
      newHostCount: 0,
      matchCount: 1
    })

    const addAll = await screen.findByRole('button', { name: 'No new hosts to add' })
    expect(addAll.hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText('No hosts in ~/.ssh/config')).toBeNull()
  })

  it('still shows the empty state when the config really has no hosts', async () => {
    await openPickerWith({ hosts: [], totalHostCount: 0, newHostCount: 0, matchCount: 0 })

    expect(await screen.findByText('No hosts in ~/.ssh/config')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Add all to Orca' }).hasAttribute('disabled')).toBe(
      true
    )
  })
})

describe('SSH config picker bulk add', () => {
  it('adds only new hosts and never re-adopts deleted aliases', async () => {
    const user = await openPicker()

    await user.click(screen.getByRole('button', { name: /Add all 2 to Orca/ }))

    await waitFor(() => expect(importConfig).toHaveBeenCalled())
    expect(importConfig).toHaveBeenCalledWith()
    expect(importConfig.mock.calls[0][0]).toBeUndefined()
  })
})

import { useState } from 'react'
import { applySshConnectionsViewerRequest } from '@/runtime/ssh-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
function SshDialogFixture() {
  const [mode, setMode] = useState<'ssh' | 'server' | null>('ssh')
  return <AddRemoteHostDialog mode={mode} onOpenChange={setMode} />
}
async function applyViewer(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applySshConnectionsViewerRequest> | undefined
  await act(async () => {
    pending = applySshConnectionsViewerRequest({
      id: 'add-host-fixture',
      expiresAt: Date.now() + 300,
      command
    })
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('fixture_request_missing')
  }
  let result: Awaited<typeof pending> | undefined
  await act(async () => {
    result = await pending
  })
  return result
}
describe('exact SSH add-dialog viewer surface', () => {
  it('never borrows the add dialog for the default settings surface', async () => {
    render(<SshDialogFixture />)
    await expect(
      applyViewer({
        viewerId: 7,
        operation: 'ssh.form-draft',
        updates: { host: 'private-host-canary' }
      })
    ).rejects.toThrow('connections_surface_unavailable')
    expect(screen.getByLabelText('Host or alias')).toHaveProperty('value', '')
  })
  it('commits private fields and the real advanced disclosure only to the explicit add surface', async () => {
    render(<SshDialogFixture />)
    const result = await applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.form-draft',
      updates: { host: 'private-host-canary', proxyCommand: 'private-proxy-canary' }
    })
    expect(result).toMatchObject({
      applied: true,
      persisted: null,
      state: { configured: { host: true, proxyCommand: true } }
    })
    expect(JSON.stringify(result)).not.toContain('canary')
    expect(screen.getByLabelText('Host or alias')).toHaveProperty('value', 'private-host-canary')
    expect(
      await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.advanced', open: true })
    ).toMatchObject({ applied: true, state: { advancedOpen: true } })
    expect(screen.getByLabelText('Proxy Command')).toHaveProperty('value', 'private-proxy-canary')
  })
  it('reports native validation failure and observes the parent dialog cancellation', async () => {
    render(<SshDialogFixture />)
    expect(
      await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.form-save' })
    ).toMatchObject({ applied: false, persisted: false })
    expect(
      await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.form-cancel' })
    ).toMatchObject({ applied: true, state: { formOpen: false } })
    expect(listTargets).not.toHaveBeenCalled()
  })
})

it('rejects duplicate add-dialog surfaces before any mutation', async () => {
  render(
    <>
      <SshDialogFixture />
      <SshDialogFixture />
    </>
  )
  await expect(
    applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.form-save' })
  ).rejects.toThrow('connections_viewer_ambiguous')
  expect(listTargets).not.toHaveBeenCalled()
})

it('acknowledges save only after the native owner refresh contains the new target and the parent closes', async () => {
  const target = {
    id: 'ssh-new',
    label: 'New',
    host: 'new.example',
    port: 22,
    username: '',
    source: 'manual'
  }
  const addTarget = vi.fn().mockResolvedValue({ target, repoReadoptions: [] })
  window.api.ssh.addTarget = addTarget
  listTargets.mockResolvedValueOnce([]).mockResolvedValueOnce([target])
  render(<SshDialogFixture />)
  await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.form-draft',
    updates: { host: target.host }
  })
  expect(
    await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.form-save' })
  ).toMatchObject({ applied: true, persisted: true, state: { formOpen: false } })
  expect(addTarget).toHaveBeenCalledTimes(1)
  expect(storeActions.setSshTargetsMetadata).toHaveBeenCalledWith([target])
})
it('refuses hidden form writes while the config picker owns the dialog', async () => {
  await openPicker()
  await expect(
    applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.form-draft',
      updates: { host: 'ignored.example' }
    })
  ).rejects.toThrow('ssh_form_unavailable')
  await expect(
    applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.form-save' })
  ).rejects.toThrow('ssh_form_unavailable')
  expect(listTargets).not.toHaveBeenCalled()
})
it('does not treat the server form as an SSH surface', async () => {
  render(<AddRemoteHostDialog mode="server" onOpenChange={vi.fn()} />)
  await expect(
    applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.form-draft',
      updates: { host: 'ignored.example' }
    })
  ).rejects.toThrow('connections_surface_unavailable')
  expect(listTargets).not.toHaveBeenCalled()
})

it('uses the existing config open/search/prefill owners and returns no private form values', async () => {
  render(<SshDialogFixture />)
  expect(
    await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.config-open' })
  ).toMatchObject({ applied: true, state: { configPickerOpen: true, configVisibleCount: 2 } })
  expect(listConfigHosts).toHaveBeenLastCalledWith({ query: '', refresh: true })
  expect(
    await applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.config-search',
      query: 'alpha',
      refresh: true
    })
  ).toMatchObject({ applied: true })
  expect(listConfigHosts).toHaveBeenLastCalledWith({ query: 'alpha', refresh: true })
  expect(screen.getByLabelText('Filter hosts…')).toHaveProperty('value', 'alpha')
  resolveConfigHost.mockResolvedValueOnce({
    ...resolution('alpha', 'alpha.internal'),
    proxyCommand: 'private-proxy-canary'
  })
  const picked = await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.config-select',
    alias: 'alpha'
  })
  expect(picked).toMatchObject({
    applied: true,
    persisted: null,
    state: { formOpen: true, configPickerOpen: false, configured: { proxyCommand: true } }
  })
  expect(JSON.stringify(picked)).not.toContain('canary')
  expect(screen.getByLabelText('Host or alias')).toHaveProperty('value', 'alpha.internal')
})
it('invalidates a pending typed config resolve when the existing back action wins', async () => {
  const pending = deferred<SshConfigHostResolution>()
  resolveConfigHost.mockReturnValueOnce(pending.promise)
  render(<SshDialogFixture />)
  await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.config-open' })
  let selection: ReturnType<typeof applySshConnectionsViewerRequest> | undefined
  await act(async () => {
    selection = applySshConnectionsViewerRequest({
      id: 'pending-selection',
      expiresAt: Date.now() + 500,
      command: { viewerId: 7, surface: 'add-host', operation: 'ssh.config-select', alias: 'alpha' }
    })
  })
  expect(
    await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.form-open' })
  ).toMatchObject({ applied: true, state: { formOpen: true } })
  await act(async () => {
    pending.resolve(resolution('alpha', 'stale.example'))
  })
  expect(await selection).toMatchObject({ applied: false })
  expect(screen.getByLabelText('Host or alias')).toHaveProperty('value', '')
})
it('refreshes the current query for already-synced bulk imports without re-adopting tombstones', async () => {
  render(<SshDialogFixture />)
  await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.config-open' })
  await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.config-search',
    query: 'alpha'
  })
  expect(
    await applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.config-import-new',
      confirmTarget: 'ssh-config-new-hosts'
    })
  ).toMatchObject({ applied: true, persisted: null, state: { configPickerOpen: true } })
  expect(importConfig).toHaveBeenCalledWith()
  expect(listConfigHosts).toHaveBeenLastCalledWith({ query: 'alpha' })
})
it('preserves the picker and rejects missing aliases or failed config loads', async () => {
  render(<SshDialogFixture />)
  await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.config-open' })
  expect(
    await applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.config-select',
      alias: 'missing'
    })
  ).toMatchObject({ applied: false })
  expect(resolveConfigHost).not.toHaveBeenCalled()
  listConfigHosts.mockRejectedValueOnce(new Error('private-loader-canary'))
  const result = await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.config-search',
    query: 'private-query-canary'
  })
  expect(result).toMatchObject({ applied: false, state: { configError: true } })
  expect(JSON.stringify(result)).not.toContain('canary')
})

it('keeps actual filter/retry/back controls on the same picker owner path', async () => {
  const user = await openPicker()
  await user.type(screen.getByLabelText('Filter hosts…'), 'alpha')
  await waitFor(() => expect(listConfigHosts).toHaveBeenLastCalledWith({ query: 'alpha' }))
  listConfigHosts.mockRejectedValueOnce(new Error('failed'))
  await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.config-search',
    query: 'alpha',
    refresh: true
  })
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() =>
    expect(listConfigHosts).toHaveBeenLastCalledWith({ query: 'alpha', refresh: true })
  )
  await user.click(screen.getByRole('button', { name: 'Back' }))
  expect(
    await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.get' })
  ).toMatchObject({ state: { formOpen: true, configPickerOpen: false } })
})
it('keeps actual form input/submit/cancel controls on the same owner path', async () => {
  const user = userEvent.setup()
  const target = {
    id: 'dom-target',
    label: 'DOM',
    host: 'dom.example',
    port: 22,
    username: '',
    source: 'manual'
  }
  window.api.ssh.addTarget = vi.fn().mockResolvedValue({ target, repoReadoptions: [] })
  listTargets.mockResolvedValueOnce([]).mockResolvedValueOnce([target])
  const view = render(<SshDialogFixture />)
  await user.type(screen.getByLabelText('Host or alias'), 'dom.example')
  const input = screen.getByLabelText('Host or alias')
  const form = input.closest('form')
  if (!form) {
    throw new Error('fixture_form_missing')
  }
  fireEvent.submit(form)
  await waitFor(() => expect(storeActions.setSshTargetsMetadata).toHaveBeenCalledWith([target]))
  expect(
    await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.get' })
  ).toMatchObject({ state: { formOpen: false } })
  view.unmount()
  render(<SshDialogFixture />)
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(
    await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.get' })
  ).toMatchObject({ state: { formOpen: false } })
})
it('does not claim bulk persistence when the canonical refresh omits imported hosts', async () => {
  render(<SshDialogFixture />)
  await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.config-open' })
  importConfig.mockResolvedValueOnce({ targets: [{ id: 'unconfirmed-host' }], repoReadoptions: [] })
  expect(
    await applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.config-import-new',
      confirmTarget: 'ssh-config-new-hosts'
    })
  ).toMatchObject({ applied: false, persisted: false, state: { configPickerOpen: true } })
})

it('drops an older config search after the current search has committed', async () => {
  render(<SshDialogFixture />)
  await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.config-open' })
  const pending = deferred<{
    hosts: Record<string, unknown>[]
    totalHostCount: number
    newHostCount: number
    matchCount: number
    hasMore: boolean
  }>()
  listConfigHosts.mockReturnValueOnce(pending.promise)
  let oldSearch: ReturnType<typeof applySshConnectionsViewerRequest> | undefined
  await act(async () => {
    oldSearch = applySshConnectionsViewerRequest({
      id: 'old-search',
      expiresAt: Date.now() + 500,
      command: { viewerId: 7, surface: 'add-host', operation: 'ssh.config-search', query: 'old' }
    })
  })
  listConfigHosts.mockResolvedValueOnce({
    hosts: [configHost('current')],
    totalHostCount: 2,
    newHostCount: 2,
    matchCount: 1,
    hasMore: false
  })
  expect(
    await applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.config-search',
      query: 'current'
    })
  ).toMatchObject({ applied: true, state: { configVisibleCount: 1 } })
  await act(async () => {
    pending.resolve({
      hosts: [configHost('old')],
      totalHostCount: 2,
      newHostCount: 2,
      matchCount: 1,
      hasMore: false
    })
  })
  expect(await oldSearch).toMatchObject({ applied: false })
  expect(screen.getByRole('button', { name: /current/ })).toBeDefined()
  expect(screen.queryByRole('button', { name: /old.internal/ })).toBeNull()
})
it('imports only new hosts and closes after the exact canonical target refresh', async () => {
  render(<SshDialogFixture />)
  await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.config-open' })
  const target = { id: 'bulk-new', host: 'bulk.example', label: 'Bulk', port: 22, username: '' }
  importConfig.mockResolvedValueOnce({ targets: [target], repoReadoptions: [] })
  listTargets.mockResolvedValueOnce([target])
  expect(
    await applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.config-import-new',
      confirmTarget: 'ssh-config-new-hosts'
    })
  ).toMatchObject({
    applied: true,
    persisted: true,
    state: { configPickerOpen: false, formOpen: false }
  })
  expect(importConfig).toHaveBeenCalledWith()
})

it('simultaneous native save clicks reach the owner once', async () => {
  const target = {
    id: 'ssh-race',
    label: 'Race',
    host: 'race.example',
    port: 22,
    username: '',
    source: 'manual'
  }
  const addTarget = vi.fn().mockResolvedValue({ target, repoReadoptions: [] })
  window.api.ssh.addTarget = addTarget
  listTargets.mockResolvedValueOnce([]).mockResolvedValueOnce([target])
  render(<SshDialogFixture />)
  await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.form-draft',
    updates: { host: target.host }
  })
  const save = screen.getByRole('button', { name: 'Save' })
  await act(async () => {
    fireEvent.click(save)
    fireEvent.click(save)
  })
  expect(addTarget).toHaveBeenCalledTimes(1)
  expect(storeActions.setSshTargetsMetadata).toHaveBeenCalledWith([target])
})

it('cancels the older GUI debounce when an explicit typed filter commits', async () => {
  const user = await openPicker()
  const input = screen.getByLabelText('Filter hosts…')
  fireEvent.change(input, { target: { value: 'old-draft' } })
  expect(input).toHaveProperty('value', 'old-draft')
  expect(
    await applyViewer({
      viewerId: 7,
      surface: 'add-host',
      operation: 'ssh.config-search',
      query: 'typed-current'
    })
  ).toMatchObject({ applied: true })
  expect(input).toHaveProperty('value', 'typed-current')
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 240))
  })
  expect(listConfigHosts).toHaveBeenLastCalledWith({ query: 'typed-current' })
  expect(listConfigHosts.mock.calls.some(([args]) => args?.query === 'old-draft')).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Back' }))
})
it('does not acknowledge a typed filter replaced by a newer GUI draft during the owner read', async () => {
  render(<SshDialogFixture />)
  await applyViewer({ viewerId: 7, surface: 'add-host', operation: 'ssh.config-open' })
  const pending = deferred<{
    hosts: Record<string, unknown>[]
    totalHostCount: number
    newHostCount: number
    matchCount: number
    hasMore: boolean
  }>()
  listConfigHosts.mockReturnValueOnce(pending.promise)
  let search: ReturnType<typeof applySshConnectionsViewerRequest> | undefined
  await act(async () => {
    search = applySshConnectionsViewerRequest({
      id: 'superseded-filter',
      expiresAt: Date.now() + 150,
      command: {
        viewerId: 7,
        surface: 'add-host',
        operation: 'ssh.config-search',
        query: 'typed-old'
      }
    })
  })
  fireEvent.change(screen.getByLabelText('Filter hosts…'), { target: { value: 'gui-new' } })
  await act(async () => {
    pending.resolve({
      hosts: [configHost('typed-old')],
      totalHostCount: 1,
      newHostCount: 1,
      matchCount: 1,
      hasMore: false
    })
  })
  expect(await search).toMatchObject({ applied: false })
  expect(screen.getByLabelText('Filter hosts…')).toHaveProperty('value', 'gui-new')
})
it('uses the same compact-host parser for native blur and explicit private form normalization', async () => {
  render(<SshDialogFixture />)
  const host = screen.getByLabelText('Host or alias')
  fireEvent.change(host, { target: { value: 'deploy@native.example:2222' } })
  fireEvent.blur(host)
  expect(host).toHaveProperty('value', 'native.example')
  expect(screen.getByLabelText('Username')).toHaveProperty('value', 'deploy')
  expect(screen.getByLabelText('Port')).toHaveProperty('value', '2222')
  await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.form-draft',
    updates: {
      host: 'operator@private-next.example:2022',
      configHost: '',
      username: '',
      port: '22'
    }
  })
  const result = await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.form-normalize'
  })
  expect(result).toMatchObject({ applied: true, persisted: null })
  expect(JSON.stringify(result)).not.toContain('private-next')
  expect(host).toHaveProperty('value', 'private-next.example')
  expect(screen.getByLabelText('Username')).toHaveProperty('value', 'operator')
  expect(screen.getByLabelText('Port')).toHaveProperty('value', '2022')
})
it('preserves explicit user/port edits and all basic form fields through the same parent draft owner', async () => {
  render(<SshDialogFixture />)
  for (const [label, value] of [
    ['Label', 'Private label'],
    ['Username', 'manual-user'],
    ['Port', '2200'],
    ['Identity file', 'private-key-path']
  ]) {
    const input = screen.getByLabelText(label)
    fireEvent.change(input, { target: { value } })
    expect(input).toHaveProperty('value', value)
  }
  await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.form-draft',
    updates: {
      label: 'Private label',
      host: 'automatic@host.example:2222',
      username: 'manual-user',
      port: '2200',
      identityFile: 'private-key-path'
    }
  })
  const result = await applyViewer({
    viewerId: 7,
    surface: 'add-host',
    operation: 'ssh.form-normalize'
  })
  expect(result).toMatchObject({
    applied: true,
    state: { configured: { host: true, username: true, identityFile: true } }
  })
  expect(screen.getByLabelText('Username')).toHaveProperty('value', 'manual-user')
  expect(screen.getByLabelText('Port')).toHaveProperty('value', '2200')
  expect(screen.getByLabelText('Identity file')).toHaveProperty('value', 'private-key-path')
  expect(JSON.stringify(result)).not.toContain('private-key-path')
})
