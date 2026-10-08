import { expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AUTOMATION_EXTENSION_HANDLERS } from './automation-extensions'
import { RuntimeClient } from '../runtime-client'
import { AutomationViewerActionSchema } from '../../shared/automation-viewer-command'

it('requires both current editor and draft reviews for save', () => {
  const action = {
    kind: 'editor-save',
    reviewedTarget: '00000000-0000-4000-8000-000000000001',
    reviewedDraft: '00000000-0000-4000-8000-000000000002'
  }
  expect(AutomationViewerActionSchema.safeParse(action).success).toBe(true)
  expect(AutomationViewerActionSchema.safeParse({ ...action, reviewedDraft: '' }).success).toBe(
    false
  )
  expect(AutomationViewerActionSchema.safeParse({ ...action, force: true }).success).toBe(false)
})

it('forwards strict save reviews and preserves old-peer failure without retrying writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-save-viewer-'))
  const file = join(root, 'action.json')
  const client = new RuntimeClient('/unused-save-viewer-fixture')
  const call = vi.spyOn(client, 'call').mockRejectedValue(new Error('unknown method'))
  const action = {
    kind: 'editor-save',
    reviewedTarget: '00000000-0000-4000-8000-000000000001',
    reviewedDraft: '00000000-0000-4000-8000-000000000002'
  }
  const context = {
    client,
    cwd: root,
    json: true,
    flags: new Map([
      ['input-file', file],
      ['viewer', 'desktop']
    ])
  }
  try {
    await writeFile(file, JSON.stringify(action))
    await expect(AUTOMATION_EXTENSION_HANDLERS['automations viewer']!(context)).rejects.toThrow(
      'unknown method'
    )
    expect(call).toHaveBeenCalledExactlyOnceWith('automation.viewerAction', {
      viewer: 'desktop',
      action
    })
    call.mockClear()
    await writeFile(file, JSON.stringify({ ...action, force: true }))
    await expect(
      AUTOMATION_EXTENSION_HANDLERS['automations viewer']!(context)
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  } finally {
    call.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
