import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { AUTOMATION_EXTENSION_HANDLERS } from './automation-extensions'
import { parseArgs } from '../args'
import { dispatch } from '../dispatch'
import { COMMAND_SPECS } from '../specs'
import { RuntimeClient } from '../runtime-client'

it('validates deletion controls and propagates old-peer errors without a fallback write', async () => {
  const command = 'automations'
  const method = 'automation.viewerAction'
  const handlers = AUTOMATION_EXTENSION_HANDLERS
  const root = await mkdtemp(join(tmpdir(), 'orca-automation-delete-viewer-'))
  const client = new RuntimeClient('/unused-automation-delete-viewer-fixture')
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
    for (const leaf of [
      { kind: 'get' },
      { kind: 'request', source: 'local', rowKey: 'host-qualified-row' },
      { kind: 'request', source: 'external', rowKey: 'external-qualified-row' },
      ...['cancel', 'dismiss', 'focus', 'confirm'].map((kind) => ({
        kind,
        reviewedTarget: '00000000-0000-4000-8000-000000000001'
      })),
      {
        kind: 'dont-ask-again',
        reviewedTarget: '00000000-0000-4000-8000-000000000001',
        value: true
      }
    ]) {
      const action = { kind: 'delete-form', action: leaf }
      await writeFile(file, JSON.stringify(action))
      await expect(
        dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
      ).rejects.toThrow('unknown method')
      expect(call).toHaveBeenCalledExactlyOnceWith(method, { viewer: 'desktop', action })
      call.mockClear()
      await writeFile(file, JSON.stringify({ ...action, action: { ...leaf, force: true } }))
      await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
        code: 'invalid_argument'
      })
      expect(call).not.toHaveBeenCalled()
    }
    for (const leaf of [
      { kind: 'confirm', reviewedTarget: 'invalid' },
      { kind: 'confirm' },
      { kind: 'request', source: 'local', rowKey: '' },
      {
        kind: 'dont-ask-again',
        reviewedTarget: '00000000-0000-4000-8000-000000000001',
        value: 'true'
      }
    ]) {
      await writeFile(file, JSON.stringify({ kind: 'delete-form', action: leaf }))
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
