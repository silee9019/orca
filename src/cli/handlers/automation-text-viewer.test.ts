import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { AUTOMATION_EXTENSION_HANDLERS } from './automation-extensions'
import { parseArgs } from '../args'
import { dispatch } from '../dispatch'
import { COMMAND_SPECS } from '../specs'
import { RuntimeClient } from '../runtime-client'

it('validates text controls and propagates old-peer errors without a fallback write', async () => {
  const command = 'automations'
  const method = 'automation.viewerAction'
  const handlers = AUTOMATION_EXTENSION_HANDLERS
  const root = await mkdtemp(join(tmpdir(), 'orca-automation-text-viewer-'))
  const client = new RuntimeClient('/unused-automation-text-viewer-fixture')
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
    const target = '00000000-0000-4000-8000-000000000001'
    const rootAction = (action: unknown) => ({
      kind: 'editor-form',
      action: { kind: 'text-form', reviewedTarget: target, action }
    })
    for (const leaf of [{ kind: 'get' }, { kind: 'focus-name', reviewedTarget: target }]) {
      const action = rootAction(leaf)
      await writeFile(file, JSON.stringify(action))
      await expect(
        dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
      ).rejects.toThrow('unknown method')
      expect(call).toHaveBeenCalledExactlyOnceWith(method, { viewer: 'desktop', action })
      call.mockClear()
      await writeFile(file, JSON.stringify(rootAction({ ...leaf, force: true })))
      await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
        code: 'invalid_argument'
      })
      expect(call).not.toHaveBeenCalled()
    }
    for (const leaf of [
      { kind: 'focus-name' },
      { kind: 'focus-name', reviewedTarget: 'invalid' },
      { kind: 'focus-name', reviewedTarget: target, stableKey: 'host' }
    ]) {
      await writeFile(file, JSON.stringify(rootAction(leaf)))
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
