import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { AUTOMATION_EXTENSION_HANDLERS } from './automation-extensions'
import { RuntimeClient } from '../runtime-client'
it('validates create template IDs and refuses unsupported peers without opening a blank draft', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-template-create-'))
  const file = join(root, 'action.json')
  const client = new RuntimeClient('/unused-template-create')
  const call = vi.spyOn(client, 'call').mockRejectedValue(new Error('unknown method'))
  const context = {
    client,
    cwd: root,
    json: true,
    flags: new Map([
      ['input-file', file],
      ['viewer', 'desktop']
    ])
  }
  const handler = AUTOMATION_EXTENSION_HANDLERS['automations viewer']
  if (!handler) {
    throw new Error('missing handler')
  }
  try {
    const action = { kind: 'editor-create', templateId: 'weekday-audit' }
    await writeFile(file, JSON.stringify(action))
    await expect(handler(context)).rejects.toThrow('unknown method')
    expect(call).toHaveBeenCalledExactlyOnceWith('automation.viewerAction', {
      viewer: 'desktop',
      action
    })
    call.mockClear()
    for (const invalid of [
      { ...action, templateId: '' },
      { ...action, templateId: 'x'.repeat(257) },
      { ...action, templateId: 1 },
      { ...action, force: true }
    ]) {
      await writeFile(file, JSON.stringify(invalid))
      await expect(handler(context)).rejects.toMatchObject({ code: 'invalid_argument' })
      expect(call).not.toHaveBeenCalled()
    }
  } finally {
    call.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
