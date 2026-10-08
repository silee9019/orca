import { afterEach, expect, it } from 'vitest'
import {
  applyRuntimeConnectionsViewerRequest,
  mountRuntimeConnectionsViewerController
} from './runtime-connections-viewer-controller'
import type {
  RuntimeConnectionsViewerState,
  ConnectionsViewerRequest
} from '../../../shared/connections-viewer'
let detach: (() => void) | undefined
afterEach(() => {
  detach?.()
  detach = undefined
})
function fixture(persisted = true) {
  const state: RuntimeConnectionsViewerState = {
    environmentId: null,
    workflow: 'connect',
    addFormOpen: false,
    shareFormOpen: true,
    advancedOpen: false,
    name: '',
    pairingCodeSet: false
  }
  let pairing = ''
  const commit = (update: () => void): void => {
    queueMicrotask(update)
  }
  detach = mountRuntimeConnectionsViewerController({
    read: () => ({ ...state }),
    matchesPairingCode: (value) => pairing === value,
    hasEnvironment: (id) => id === null || id === 'server-a',
    useEnvironment: async (id) => {
      if (persisted) {
        commit(() => {
          state.environmentId = id
        })
      }
      return persisted
    },
    setWorkflow: (value) =>
      commit(() => {
        state.workflow = value
      }),
    setAddFormOpen: (value) =>
      commit(() => {
        state.addFormOpen = value
      }),
    setShareFormOpen: (value) =>
      commit(() => {
        state.shareFormOpen = value
      }),
    setAdvancedOpen: (value) =>
      commit(() => {
        state.advancedOpen = value
      }),
    setName: (value) =>
      commit(() => {
        state.name = value
      }),
    setPairingCode: (value) =>
      commit(() => {
        pairing = value
        state.pairingCodeSet = value.length > 0
      }),
    cancelAdd: () =>
      commit(() => {
        state.addFormOpen = false
        state.name = ''
        pairing = ''
        state.pairingCodeSet = false
      })
  })
  return state
}
function request(command: ConnectionsViewerRequest['command']): ConnectionsViewerRequest {
  return { id: 'fixture', expiresAt: Date.now() + 100, command }
}
it('waits for committed viewer-local form and workflow changes without claiming persistence', async () => {
  fixture()
  const workflow = await applyRuntimeConnectionsViewerRequest(
    request({ viewerId: 4, operation: 'runtime.workflow', value: 'share' })
  )
  expect(workflow).toMatchObject({
    viewerId: 4,
    persisted: null,
    applied: true,
    state: { workflow: 'share' }
  })
  const result = await applyRuntimeConnectionsViewerRequest(
    request({ viewerId: 4, operation: 'runtime.add-form', open: true })
  )
  expect(result.state.addFormOpen).toBe(true)
})
it('keeps private pairing drafts out of the result and observes replacement before ack', async () => {
  fixture()
  for (const value of ['first-private-canary', 'replacement-private-canary']) {
    const result = await applyRuntimeConnectionsViewerRequest(
      request({ viewerId: 4, operation: 'runtime.draft-pairing', value })
    )
    expect(result.applied).toBe(true)
    expect(JSON.stringify(result)).not.toContain('private-canary')
  }
})
it('selects only a known viewer server and separates persistence from application', async () => {
  fixture()
  await expect(
    applyRuntimeConnectionsViewerRequest(
      request({ viewerId: 4, operation: 'runtime.use', environmentId: 'unknown' })
    )
  ).rejects.toThrow('environment_not_found')
  const selected = await applyRuntimeConnectionsViewerRequest(
    request({ viewerId: 4, operation: 'runtime.use', environmentId: 'server-a' })
  )
  expect(selected).toMatchObject({
    persisted: null,
    applied: true,
    state: { environmentId: 'server-a' }
  })
  detach?.()
  detach = undefined
  fixture(false)
  const refused = await applyRuntimeConnectionsViewerRequest(
    request({ viewerId: 4, operation: 'runtime.use', environmentId: 'server-a' })
  )
  expect(refused).toMatchObject({ persisted: null, applied: false })
})
it('rejects an expired request and an unmounted surface without mutating another viewer', async () => {
  const state = fixture()
  const value = request({ viewerId: 4, operation: 'runtime.advanced', open: true })
  value.expiresAt = 0
  await expect(applyRuntimeConnectionsViewerRequest(value)).rejects.toThrow('request_expired')
  expect(state.advancedOpen).toBe(false)
  detach?.()
  detach = undefined
  await expect(
    applyRuntimeConnectionsViewerRequest(request({ viewerId: 4, operation: 'runtime.get' }))
  ).rejects.toThrow('connections_surface_unavailable')
})
