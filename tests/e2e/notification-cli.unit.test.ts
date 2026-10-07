import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Store } from '../../src/main/persistence'
import { parseArgs } from '../../src/cli/args'
import { OS_PERMISSION_COMMAND_SPECS } from '../../src/cli/specs/os-permissions'
import { OS_PERMISSION_HANDLERS } from '../../src/cli/handlers/os-permissions'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { OS_PERMISSION_METHODS } from '../../src/main/runtime/rpc/methods/os-permissions'
import { buildRegistry, type RpcContext } from '../../src/main/runtime/rpc/core'
import {
  registerNotificationHandlers,
  getNotificationControls
} from '../../src/main/ipc/notifications'
import {
  getDispatchHandler,
  getDismissHandler,
  notificationShowMock,
  notificationCloseMock,
  resetNotificationDispatchMocks,
  readAuthorizationStatusMock
} from '../../src/main/ipc/notifications-test-harness'
vi.mock('electron', async () =>
  (await import('../../src/main/ipc/notifications-test-harness')).createElectronModuleMock()
)
vi.mock('../../src/main/ipc/notification-authorization-status', async () =>
  (
    await import('../../src/main/ipc/notifications-test-harness')
  ).createNotificationAuthorizationModuleMock()
)
vi.mock('../../src/main/ipc/ui', async () =>
  (
    await import('../../src/main/ipc/notifications-test-harness')
  ).createTrustedUIRendererModuleMock()
)
vi.mock('../../src/main/tray/system-tray', async () =>
  (await import('../../src/main/ipc/notifications-test-harness')).createSystemTrayModuleMock()
)
const registry = buildRegistry(OS_PERMISSION_METHODS)
const context: RpcContext = { runtime: vi.fn<() => RpcContext['runtime']>()() }
let folder = ''
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'orca-permission-fixture-'))
  resetNotificationDispatchMocks()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(folder, { recursive: true, force: true })
})
it('parses CLI input, refuses unconfirmed dispatch, and reaches the installed IPC delivery and dismissal instance', async () => {
  const settings = {
    notifications: {
      enabled: true,
      agentTaskComplete: true,
      terminalBell: true,
      suppressWhenFocused: false,
      customSoundId: 'system'
    }
  }
  const fixture = { getSettings: () => settings, getUI: () => ({}), updateUI: vi.fn() }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: notification registration reads only these three Store operations; fixture never loads a profile.
  registerNotificationHandlers(fixture as unknown as Store)
  readAuthorizationStatusMock.mockResolvedValue('authorized')
  const service = getNotificationControls()
  expect(service).not.toBeNull()
  const client = new RuntimeClient(folder, 1000, null, null)
  const calls = vi.spyOn(client, 'call').mockImplementation(async (name, input) => {
    const method = registry.get(name)
    if (!method || 'stream' in method) {
      throw new Error('missing fixture RPC')
    }
    const result = await method.handler(method.params?.parse(input), context)
    return { ok: true, id: 'fixture', _meta: { runtimeId: 'fixture' }, result }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const requestPath = join(folder, 'request.json')
  await writeFile(
    requestPath,
    JSON.stringify({ source: 'test', notificationId: 'fixture-notification' })
  )
  async function run(argv: string[]): Promise<void> {
    const parsed = parseArgs(
      argv,
      OS_PERMISSION_COMMAND_SPECS.map((s) => s.path),
      OS_PERMISSION_COMMAND_SPECS
    )
    const handler = OS_PERMISSION_HANDLERS[parsed.commandPath.join(' ')]
    if (!handler) {
      throw new Error('missing fixture CLI handler')
    }
    await handler({ flags: parsed.flags, client, cwd: folder, json: true })
  }
  await expect(
    run(['notification', 'dispatch', '--viewer', 'desktop', '--request-file', requestPath])
  ).rejects.toThrow('confirm')
  expect(calls).not.toHaveBeenCalled()
  expect(notificationShowMock).not.toHaveBeenCalled()
  await run([
    'notification',
    'dispatch',
    '--viewer',
    'desktop',
    '--confirm',
    'true',
    '--request-file',
    requestPath,
    '--json'
  ])
  expect(calls).toHaveBeenCalledOnce()
  expect(notificationShowMock).toHaveBeenCalledOnce()
  expect(getNotificationControls()).toBe(service)
  await run([
    'notification',
    'dismiss',
    '--viewer',
    'desktop',
    '--id',
    'fixture-notification',
    '--json'
  ])
  expect(notificationCloseMock).toHaveBeenCalledOnce()
  expect(getDismissHandler()({}, ['fixture-notification'])).toEqual({ dismissed: 0 })
  await getDispatchHandler()({}, { source: 'test', notificationId: 'fixture-ipc' })
  expect(notificationShowMock).toHaveBeenCalledTimes(2)
  expect(service?.dismiss(['fixture-ipc'])).toEqual({ dismissed: 1 })
})
