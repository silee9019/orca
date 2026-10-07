import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRegistry, type RpcContext } from '../core'
import { OS_PERMISSION_METHODS } from './os-permissions'
const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(() => [{ id: 'camera', status: 'not-determined' }]),
  request: vi.fn(async (id: string) => ({ id, status: 'granted', openedSystemSettings: false })),
  open: vi.fn(async () => true),
  reset: vi.fn(async () => ({ platform: 'darwin', reset: true })),
  controls: vi.fn(),
  consume: vi.fn((owner: number) => ({ claimId: 1, promptCount: 1, owner })),
  release: vi.fn(),
  acknowledge: vi.fn(),
  dismiss: vi.fn(),
  status: vi.fn(() => ({ promptCount: 1, pending: true })),
  attribution: vi.fn(async () => ({ health: 'unknown', folderAccessMismatch: null }))
}))
vi.mock('../../../ipc/developer-permissions', () => ({
  getDeveloperPermissionStatus: mocks.getStatus,
  requestPermission: mocks.request,
  openPrivacyPane: mocks.open
}))
vi.mock('../../../computer/macos-computer-use-permissions', () => ({
  resetComputerUsePermissions: mocks.reset
}))
vi.mock('../../../notifications/notification-controls', () => ({
  getNotificationControls: mocks.controls
}))
vi.mock('../../../ipc/pty-management', () => ({ readDaemonMacTccAttribution: mocks.attribution }))
vi.mock('../../../macos-tcc-prompt-notice', () => ({
  getTccPromptNoticeStatus: mocks.status,
  consumePendingTccPromptNotice: mocks.consume,
  releasePendingTccPromptClaim: mocks.release,
  acknowledgePendingTccPromptClaim: mocks.acknowledge,
  dismissTccPromptNotice: mocks.dismiss
}))
const registry = buildRegistry(OS_PERMISSION_METHODS)
const context: RpcContext = {
  runtime: vi.fn<() => RpcContext['runtime']>()(),
  connectionId: 'fixture'
}
async function call(name: string, params: unknown, ctx = context): Promise<unknown> {
  const method = registry.get(name)
  if (!method || 'stream' in method) {
    throw new Error('missing method')
  }
  return method.handler(method.params?.parse(params), ctx)
}
beforeEach(() => vi.clearAllMocks())
describe('OS permission RPC effects', () => {
  it('queries developer state without requesting access', async () => {
    expect(await call('developerPermissions.getStatus', {})).toEqual([
      { id: 'camera', status: 'not-determined' }
    ])
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('rejects absent confirmation and unknown permission before OS effects', async () => {
    await expect(
      call('developerPermissions.request', { id: 'camera', viewer: 'desktop' })
    ).rejects.toThrow()
    await expect(
      call('developerPermissions.request', { id: 'invalid', viewer: 'desktop', confirm: true })
    ).rejects.toThrow()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(
      await call('developerPermissions.request', { id: 'camera', viewer: 'desktop', confirm: true })
    ).toEqual({ id: 'camera', status: 'granted', openedSystemSettings: false })
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith('camera')
  })
  it('requires explicit desktop confirmation for reset', async () => {
    await expect(call('computer.permissionsReset', { confirm: true })).rejects.toThrow()
    expect(mocks.reset).not.toHaveBeenCalled()
    await call('computer.permissionsReset', { viewer: 'desktop', confirm: true })
    expect(mocks.reset).toHaveBeenCalledOnce()
  })
  it('reports an unavailable desktop notification service without pretending delivery', async () => {
    mocks.controls.mockReturnValue(null)
    await expect(call('notifications.getPermissionStatus', { viewer: 'desktop' })).rejects.toThrow(
      'desktop_unavailable'
    )
  })
  it('dispatches and dismisses through the same installed notification controls', async () => {
    const dispatch = vi.fn(() => ({ native: 'delivered' }))
    const dismiss = vi.fn(() => ({ dismissed: 1 }))
    mocks.controls.mockReturnValue({ dispatch, dismiss })
    const request = { source: 'test', notificationId: 'fixture-only' }
    await call('notifications.dispatch', { viewer: 'desktop', confirm: true, request })
    await call('notifications.dismiss', { viewer: 'desktop', ids: ['fixture-only'] })
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(request)
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(['fixture-only'], undefined)
  })
  it('uses a negative capability-bound TCC owner namespace and rejects numeric renderer owners', async () => {
    await call('macosTccPrompts.consumePending', {
      claimToken: '5b332016-1bcf-4db1-beda-aa1d69b04c85'
    })
    const owner = mocks.consume.mock.calls[0]?.[0]
    expect(owner).toBeLessThan(0)
    await call('macosTccPrompts.releasePending', {
      claimId: 1,
      claimToken: '5b332016-1bcf-4db1-beda-aa1d69b04c85'
    })
    expect(mocks.release).toHaveBeenCalledWith(owner, 1)
    await call('macosTccPrompts.consumePending', {
      claimToken: '921b75d1-c721-4785-bd9c-30c1821cb620'
    })
    expect(mocks.consume.mock.calls[1]?.[0]).not.toBe(owner)
    await expect(call('macosTccPrompts.consumePending', { ownerToken: 1 })).rejects.toThrow()
  })
})

it('preserves unsupported and failed notification settings outcomes', async () => {
  const openSystemSettings = vi.fn(async () => false)
  mocks.controls.mockReturnValue({ openSystemSettings })
  expect(
    await call('notifications.openSystemSettings', { viewer: 'desktop', confirm: true })
  ).toEqual({ openedSystemSettings: false, status: 'unsupported' })
  openSystemSettings.mockRejectedValue(new Error('fixture settings failure'))
  await expect(
    call('notifications.openSystemSettings', { viewer: 'desktop', confirm: true })
  ).rejects.toThrow('fixture settings failure')
})
