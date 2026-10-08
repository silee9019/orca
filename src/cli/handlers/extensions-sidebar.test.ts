import { expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { EXTENSIONS_SIDEBAR_HANDLERS } from './extensions-sidebar'
import { EXTENSIONS_SIDEBAR_COMMAND_SPECS } from '../specs/extensions-sidebar'
import { ExtensionsSidebarParams } from '../../shared/extensions-sidebar-command'

it('requires strict desktop requests and reviewed open or hide actions', () => {
  const reviewedTarget = '00000000-0000-4000-8000-000000000001'
  for (const page of ['automations', 'skills', 'artifacts']) {
    for (const kind of ['open', 'hide', 'show', 'open-page']) {
      expect(
        ExtensionsSidebarParams.safeParse({
          viewer: 'desktop',
          action: { kind, page, reviewedTarget }
        }).success
      ).toBe(true)
      expect(
        ExtensionsSidebarParams.safeParse({ viewer: 'desktop', action: { kind, page } }).success
      ).toBe(false)
    }
  }
  for (const request of [
    { viewer: 'remote', action: { kind: 'get' } },
    { viewer: 'desktop', action: { kind: 'get', force: true } },
    { viewer: 'desktop', action: { kind: 'open', page: 'mobile', reviewedTarget } },
    { viewer: 'desktop', action: { kind: 'hide', page: 'skills', reviewedTarget }, force: true }
  ]) {
    expect(ExtensionsSidebarParams.safeParse(request).success).toBe(false)
  }
  expect(EXTENSIONS_SIDEBAR_COMMAND_SPECS[0]?.allowedFlags).toContain('input-stdin')
})
it('forwards exact JSON and surfaces old-peer errors without remote or persisted-ui fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-extensions-sidebar-'))
  const file = join(root, 'request.json')
  const client = new RuntimeClient('/unused-extensions-sidebar-fixture')
  const call = vi.spyOn(client, 'call').mockRejectedValue(new Error('unknown method'))
  const ctx = { client, cwd: root, json: true, flags: new Map([['input-file', file]]) }
  const request = { viewer: 'desktop', action: { kind: 'get' } }
  try {
    await writeFile(file, JSON.stringify(request))
    await expect(EXTENSIONS_SIDEBAR_HANDLERS['extensions sidebar']!(ctx)).rejects.toThrow(
      'unknown method'
    )
    expect(call).toHaveBeenCalledExactlyOnceWith('extensions.sidebarAction', request)
    call.mockClear()
    ctx.flags.set('environment', 'remote')
    await expect(EXTENSIONS_SIDEBAR_HANDLERS['extensions sidebar']!(ctx)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(call).not.toHaveBeenCalled()
    ctx.flags.delete('environment')
    await writeFile(file, JSON.stringify({ ...request, force: true }))
    await expect(EXTENSIONS_SIDEBAR_HANDLERS['extensions sidebar']!(ctx)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(call).not.toHaveBeenCalled()
  } finally {
    call.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
