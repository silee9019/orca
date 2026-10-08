import { afterEach, expect, it } from 'vitest'
import {
  applySshConnectionsViewerRequest,
  mountSshConnectionsViewerController,
  mountSshAdvancedViewerController,
  readSshAdvancedViewerState
} from './ssh-connections-viewer-controller'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
import type { SshViewerDraft } from '../../../shared/rpc-contract/connections-viewer-params'
let detach: (() => void) | undefined
let detachAdvanced: (() => void) | undefined
afterEach(() => {
  detach?.()
  detachAdvanced?.()
  detach = undefined
  detachAdvanced = undefined
})
function fixture(saveSucceeds = true) {
  let formOpen = false
  let editingId: string | null = null
  let draft: SshViewerDraft = {}
  let advanced = false
  const commit = (update: () => void): void => {
    queueMicrotask(update)
  }
  detachAdvanced = mountSshAdvancedViewerController({
    read: () => advanced,
    set: (open) =>
      commit(() => {
        advanced = open
      })
  })
  detach = mountSshConnectionsViewerController({
    read: () => ({
      formOpen,
      editingId,
      saving: false,
      advancedOpen: formOpen ? readSshAdvancedViewerState() : null,
      configured: {
        host: Boolean(draft.host),
        username: Boolean(draft.username),
        identityFile: Boolean(draft.identityFile),
        proxyCommand: Boolean(draft.proxyCommand),
        jumpHost: Boolean(draft.jumpHost)
      }
    }),
    matchesDraft: (updates) =>
      Object.entries(updates).every(([key, value]) => Reflect.get(draft, key) === value),
    open: () =>
      commit(() => {
        formOpen = true
        editingId = null
        draft = {}
      }),
    edit: (id) => {
      if (id !== 'host-a') {
        return false
      }
      commit(() => {
        formOpen = true
        editingId = id
        draft = { proxyCommand: 'private-existing-canary' }
      })
      return true
    },
    cancel: () =>
      commit(() => {
        formOpen = false
        editingId = null
        draft = {}
      }),
    draft: (updates) =>
      commit(() => {
        draft = { ...draft, ...updates }
      }),
    save: async () => {
      if (saveSucceeds) {
        commit(() => {
          formOpen = false
          editingId = null
          draft = {}
        })
      }
      return saveSucceeds
    }
  })
}
function request(command: ConnectionsViewerRequest['command']): ConnectionsViewerRequest {
  return { id: 'fixture', expiresAt: Date.now() + 200, command }
}
it('opens the existing SSH form and observes a private draft without returning credentials', async () => {
  fixture()
  await applySshConnectionsViewerRequest(request({ viewerId: 6, operation: 'ssh.form-open' }))
  const result = await applySshConnectionsViewerRequest(
    request({
      viewerId: 6,
      operation: 'ssh.form-draft',
      updates: { host: 'private-host-canary', proxyCommand: 'private-proxy-canary' }
    })
  )
  expect(result).toMatchObject({
    applied: true,
    persisted: null,
    state: { configured: { host: true, proxyCommand: true } }
  })
  expect(JSON.stringify(result)).not.toContain('canary')
})
it('edits only an existing target and applies the actual advanced disclosure', async () => {
  fixture()
  await expect(
    applySshConnectionsViewerRequest(
      request({ viewerId: 6, operation: 'ssh.form-edit', targetId: 'unknown' })
    )
  ).rejects.toThrow('ssh_target_not_found')
  const edited = await applySshConnectionsViewerRequest(
    request({ viewerId: 6, operation: 'ssh.form-edit', targetId: 'host-a' })
  )
  expect(edited.state.editingId).toBe('host-a')
  const advanced = await applySshConnectionsViewerRequest(
    request({ viewerId: 6, operation: 'ssh.advanced', open: true })
  )
  expect(advanced.state.advancedOpen).toBe(true)
  expect(JSON.stringify(edited)).not.toContain('private-existing-canary')
})
it('reports save persistence independently from the committed dialog closure', async () => {
  fixture()
  await applySshConnectionsViewerRequest(request({ viewerId: 6, operation: 'ssh.form-open' }))
  const saved = await applySshConnectionsViewerRequest(
    request({ viewerId: 6, operation: 'ssh.form-save' })
  )
  expect(saved).toMatchObject({ persisted: true, applied: true, state: { formOpen: false } })
})
it('preserves a failed save and refuses draft changes when the form is unavailable', async () => {
  fixture(false)
  await expect(
    applySshConnectionsViewerRequest(
      request({ viewerId: 6, operation: 'ssh.form-draft', updates: { username: 'private' } })
    )
  ).rejects.toThrow('ssh_form_unavailable')
  await applySshConnectionsViewerRequest(request({ viewerId: 6, operation: 'ssh.form-open' }))
  const failed = await applySshConnectionsViewerRequest(
    request({ viewerId: 6, operation: 'ssh.form-save' })
  )
  expect(failed).toMatchObject({ persisted: false, applied: false, state: { formOpen: true } })
  const cancelled = await applySshConnectionsViewerRequest(
    request({ viewerId: 6, operation: 'ssh.form-cancel' })
  )
  expect(cancelled.state.formOpen).toBe(false)
})
