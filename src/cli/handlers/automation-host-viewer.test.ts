import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { AUTOMATION_EXTENSION_HANDLERS } from './automation-extensions'
import { parseArgs } from '../args'
import { dispatch } from '../dispatch'
import { COMMAND_SPECS } from '../specs'
import { RuntimeClient } from '../runtime-client'

it('validates host selection controls and propagates old-peer errors without a fallback write', async () => {
  const command = 'automations'
  const method = 'automation.viewerAction'
  const handlers = AUTOMATION_EXTENSION_HANDLERS
  const root = await mkdtemp(join(tmpdir(), 'orca-automation-host-viewer-'))
  const client = new RuntimeClient('/unused-automation-host-viewer-fixture')
  const call = vi.spyOn(client, 'call').mockRejectedValue(new Error('unknown method'))
  const file = join(root, 'action.json')
  const context = {
    client,
    cwd: root,
    json: true,
    flags: new Map([
      ['input-file', file],
      ['viewer', 'desktop']
    ])
  }
  const parsed = parseArgs(
    [command, 'viewer', '--viewer', 'desktop', '--input-file', file, '--json'],
    COMMAND_SPECS.map((spec) => spec.path),
    COMMAND_SPECS
  )
  try {
    for (const action of [
      {
        kind: 'host-recover',
        stableKey: 'loaded-host',
        reviewedOwner: 'captured-owner',
        action: 'retry'
      },
      {
        kind: 'host-recover',
        stableKey: 'loaded-host',
        reviewedOwner: 'captured-owner',
        action: 'reconnect'
      },
      {
        kind: 'host-recover',
        stableKey: 'loaded-host',
        reviewedOwner: 'captured-owner',
        action: 'update-server'
      },
      { kind: 'refresh' },
      { kind: 'host-select', stableKey: null },
      { kind: 'host-select', stableKey: 'loaded-host' }
    ]) {
      await writeFile(file, JSON.stringify(action))
      await expect(
        dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
      ).rejects.toThrow('unknown method')
      expect(call).toHaveBeenCalledExactlyOnceWith(method, { viewer: 'desktop', action })
      call.mockClear()
      await writeFile(file, JSON.stringify({ ...action, force: true }))
      await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
        code: 'invalid_argument'
      })
      expect(call).not.toHaveBeenCalled()
    }
    for (const action of [
      { kind: 'host-recover', stableKey: 'loaded-host', action: 'retry' },
      {
        kind: 'host-recover',
        stableKey: 'loaded-host',
        reviewedOwner: 'owner',
        action: 'unsupported'
      },
      { kind: 'host-select' },
      { kind: 'host-select', stableKey: '' },
      { kind: 'host-select', stableKey: 7 },
      { kind: 'host-select', stableKey: 'x'.repeat(2049) },
      { kind: 'host-select', stableKey: 'loaded-host', host: {} }
    ]) {
      await writeFile(file, JSON.stringify(action))
      await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
        code: 'invalid_argument'
      })
      expect(call).not.toHaveBeenCalled()
    }
  } finally {
    call.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
