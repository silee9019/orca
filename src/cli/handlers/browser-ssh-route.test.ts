import { BrowserSshRouteReceipt } from '../../shared/rpc-contract/browser-ssh-route-params'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { BROWSER_SSH_ROUTE_COMMAND_SPECS } from '../specs/browser-ssh-route'
import { BROWSER_SSH_ROUTE_HANDLERS } from './browser-ssh-route'
const client = new RuntimeClient(join(tmpdir(), 'ssh-route-fixture'), 60_000, null, null)
const target = {
  worktreeId: 'folder:fixture',
  page: 'page',
  targetId: 'target',
  profileId: 'default',
  errorKind: 'forwarding-blocked',
  action: 'retry'
}
afterEach(() => vi.restoreAllMocks())
async function run(action = 'retry', confirm = false) {
  const parsed = parseArgs([
    'browser',
    'ssh-route',
    '--viewer',
    'host',
    '--worktree',
    target.worktreeId,
    '--page',
    target.page,
    '--target',
    target.targetId,
    '--profile',
    target.profileId,
    '--error-kind',
    target.errorKind,
    '--action',
    action,
    ...(confirm ? ['--confirm'] : [])
  ])
  validateCommandAndFlags(BROWSER_SSH_ROUTE_COMMAND_SPECS, parsed)
  await BROWSER_SSH_ROUTE_HANDLERS['browser ssh-route']({
    flags: parsed.flags,
    client,
    cwd: tmpdir(),
    json: true
  })
}
it('routes the exact target and requires a matching typed route receipt', async () => {
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      applied: true,
      sshRoute: { ...target, accepted: true, attempt: 1, routeState: 'preparing' }
    }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'ssh-route',
    target
  })
  for (const sshRoute of [
    undefined,
    { ...target, accepted: true },
    { ...target, accepted: true, attempt: 1, routeState: 'ready', targetId: 'other' }
  ]) {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result: { applied: true, sshRoute }
    })
    await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  }
})
it.each(['try-without-probe', 'browse-local'])(
  'requires explicit confirmation for %s before invoking the viewer',
  async (action) => {
    const call = vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      _meta: { runtimeId: 'fixture' },
      result: {
        applied: true,
        sshRoute: { ...target, action, accepted: true, attempt: 1, routeState: 'unrouted' }
      }
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(run(action)).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
    await run(action, true)
    expect(call).toHaveBeenCalledOnce()
  }
)

it('keeps a newer route state readable while refusing a malformed state', () => {
  const receipt = { ...target, accepted: true, attempt: 1, routeState: 'future-route-state' }
  expect(BrowserSshRouteReceipt.parse(receipt).routeState).toBe('error')
  expect(BrowserSshRouteReceipt.safeParse({ ...receipt, routeState: 1 }).success).toBe(false)
})
