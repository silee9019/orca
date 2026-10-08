import { expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AUTOMATION_EXTENSION_HANDLERS } from './automation-extensions'
import { RuntimeClient } from '../runtime-client'
import { AutomationViewerActionSchema } from '../../shared/automation-viewer-command'

it('accepts a reviewed dashboard entry and rejects missing review or unknown fields', () => {
  const action = {
    kind: 'runs-open',
    entryKey: 'owner-qualified-entry',
    reviewedTarget: '00000000-0000-4000-8000-000000000001'
  }
  expect(AutomationViewerActionSchema.safeParse(action).success).toBe(true)
  expect(AutomationViewerActionSchema.safeParse({ ...action, reviewedTarget: '' }).success).toBe(
    false
  )
  expect(AutomationViewerActionSchema.safeParse({ ...action, entryKey: '' }).success).toBe(false)
  expect(AutomationViewerActionSchema.safeParse({ ...action, force: true }).success).toBe(false)
})

it('forwards a strict navigation request and surfaces an old-peer error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-run-navigation-'))
  const file = join(root, 'action.json')
  const client = new RuntimeClient('/unused-run-navigation-fixture')
  const call = vi.spyOn(client, 'call').mockRejectedValue(new Error('unknown method'))
  const action = {
    kind: 'runs-open',
    entryKey: 'entry',
    reviewedTarget: '00000000-0000-4000-8000-000000000001'
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
