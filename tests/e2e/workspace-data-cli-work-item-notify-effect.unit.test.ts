import { directory, source, store, ctx, window } from './workspace-data-cli-remote-clone-fixture'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { webContents } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WORKSPACE_WORK_ITEM_NOTIFY_HANDLERS } from '../../src/cli/handlers/workspace-work-item-notify'
import {
  WORKSPACE_WORK_ITEM_NOTIFY_METHODS,
  setDesktopWorkItemNotificationStore
} from '../../src/main/runtime/rpc/methods/workspace-work-item-notify'
import { notifyGitHubWorkItemMutation } from '../../src/main/github-work-item-notification'
import { setTrustedUIRendererWebContentsId } from '../../src/main/ipc/ui'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
import { DesktopWorkItemNotify } from '../../src/shared/rpc-contract/workspace-work-item-notify-params'

const messages: { channel: string; payload: unknown }[] = []
async function invoke(extra: object = {}) {
  const input = join(directory, 'notification.json')
  await writeFile(
    input,
    JSON.stringify({
      expectedExecutionHostId: 'local',
      expectedRepoHostId: 'local',
      repoId: 'fixture',
      type: 'issue',
      number: 1,
      ...extra
    })
  )
  ctx.flags = new Map([['params-file', input]])
  await WORKSPACE_WORK_ITEM_NOTIFY_HANDLERS['github notify-work-item-mutated'](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(() => {
  messages.length = 0
  store.addRepo({
    id: 'fixture',
    path: source,
    displayName: 'Git fixture',
    badgeColor: 'blue',
    addedAt: 1
  })
  setDesktopWorkItemNotificationStore(store)
  setTrustedUIRendererWebContentsId(901)
  vi.mocked(webContents.fromId).mockImplementation((id) =>
    id === 901 ? window.webContents : undefined
  )
  vi.mocked(window.webContents.send).mockImplementation((channel, payload) => {
    messages.push({ channel, payload })
  })
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_WORK_ITEM_NOTIFY_METHODS
  })
  vi.mocked(ctx.client.call).mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
})
afterEach(() => {
  setDesktopWorkItemNotificationStore(null)
  setTrustedUIRendererWebContentsId(null)
})
it('delivers to the original trusted UI message path without claiming rendered or provider mutation', async () => {
  expect(await invoke()).toEqual({ requested: true, rendered: false })
  expect(messages).toEqual([
    {
      channel: 'gh:workItemMutated',
      payload: { repoPath: source, repoId: 'fixture', type: 'issue', number: 1 }
    }
  ])
  expect(await invoke({ type: 'pr', number: 2 })).toEqual({ requested: true, rendered: false })
  expect(messages[1]?.payload).toMatchObject({ type: 'pr', number: 2 })
  setTrustedUIRendererWebContentsId(null)
  expect(await invoke()).toEqual({ requested: true, rendered: false })
  expect(messages).toHaveLength(2)
})
it('preserves original IPC validation and sender exclusion through the extracted service', () => {
  const args = { repoPath: source, repoId: 'fixture', type: 'issue' as const, number: 1 }
  expect(notifyGitHubWorkItemMutation(store, args, 901)).toBe(true)
  expect(messages).toHaveLength(0)
  expect(notifyGitHubWorkItemMutation(store, args, 902)).toBe(true)
  expect(messages).toHaveLength(1)
  expect(notifyGitHubWorkItemMutation(store, { ...args, repoId: 'missing' })).toBe(false)
  expect(notifyGitHubWorkItemMutation(store, { ...args, number: 0 })).toBe(false)
  expect(notifyGitHubWorkItemMutation(store, { ...args, number: 1.5 })).toBe(false)
  expect(messages).toHaveLength(1)
})
it('rejects foreign ownership, folder targets and input authority before notification', async () => {
  store.addRepo({
    id: 'folder',
    path: directory,
    displayName: 'Folder',
    kind: 'folder',
    badgeColor: 'blue',
    addedAt: 2
  })
  for (const params of [
    { repoId: 'missing' },
    { repoId: 'folder' },
    { expectedRepoHostId: 'ssh:foreign' }
  ]) {
    await expect(invoke(params)).rejects.toThrow()
  }
  expect(messages).toHaveLength(0)
  for (const params of [
    { senderId: 901 },
    { repoPath: source },
    { expectedExecutionHostId: 'ssh:foreign' },
    { number: 0 },
    { number: 1.5 },
    { type: 'task' }
  ]) {
    vi.mocked(ctx.client.call).mockClear()
    await expect(invoke(params)).rejects.toThrow()
    expect(ctx.client.call).not.toHaveBeenCalled()
  }
  expect(DesktopWorkItemNotify.safeParse({}).success).toBe(false)
})
it('fails explicitly when desktop ownership or an old peer is unavailable', async () => {
  setDesktopWorkItemNotificationStore(null)
  await expect(invoke()).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke()).rejects.toMatchObject({ code: 'method_not_found' })
  expect(messages).toHaveLength(0)
})
