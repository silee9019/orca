import {
  SparsePresetViewerActionSchema,
  SparsePresetViewerParams
} from '../../shared/sparse-preset-viewer-command'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RuntimeClient } from '../runtime-client'
import { SPARSE_PRESET_HANDLERS } from './sparse-presets'
import { expect, it, vi } from 'vitest'
import { SPARSE_PRESET_COMMAND_SPECS } from '../specs/sparse-presets'
it('advertises the mounted sparse preset viewer with explicit JSON input', () => {
  const spec = SPARSE_PRESET_COMMAND_SPECS.find(
    (entry) => entry.path.join(' ') === 'sparse-presets viewer'
  )
  expect(spec?.allowedFlags).toContain('input-file')
  expect(spec?.allowedFlags).toContain('input-stdin')
})

it('forwards strict desktop requests and exposes old-peer errors without fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-sparse-viewer-'))
  const file = join(root, 'request.json')
  const client = new RuntimeClient('/unused-sparse-viewer-fixture')
  const call = vi.spyOn(client, 'call').mockRejectedValue(new Error('unknown method'))
  const context = { client, cwd: root, json: true, flags: new Map([['input-file', file]]) }
  const request = { viewer: 'desktop', repoId: 'repo', action: { kind: 'get' } }
  try {
    await writeFile(file, JSON.stringify(request))
    await expect(SPARSE_PRESET_HANDLERS['sparse-presets viewer']!(context)).rejects.toThrow(
      'unknown method'
    )
    expect(call).toHaveBeenCalledExactlyOnceWith('sparsePreset.viewerAction', request)
    call.mockClear()
    const settings = { ...request, surface: 'settings' }
    await writeFile(file, JSON.stringify(settings))
    await expect(SPARSE_PRESET_HANDLERS['sparse-presets viewer']!(context)).rejects.toThrow(
      'unknown method'
    )
    expect(call).toHaveBeenCalledExactlyOnceWith('sparsePreset.viewerAction', settings)
    call.mockClear()
    await writeFile(file, JSON.stringify({ ...request, force: true }))
    await expect(SPARSE_PRESET_HANDLERS['sparse-presets viewer']!(context)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(call).not.toHaveBeenCalled()
    context.flags.set('connection', 'remote')
    await expect(SPARSE_PRESET_HANDLERS['sparse-presets viewer']!(context)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(call).not.toHaveBeenCalled()
  } finally {
    call.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
it('accepts reviewed inline draft directory and name-touch controls', () => {
  const reviewedTarget = '00000000-0000-4000-8000-000000000001'
  for (const action of [
    { kind: 'name-touch' },
    { kind: 'directories-add', directories: ['src', 'packages/ui'] },
    { kind: 'directory-remove', directory: 'src' }
  ]) {
    expect(SparsePresetViewerActionSchema.safeParse({ reviewedTarget, ...action }).success).toBe(
      true
    )
  }
})
it('accepts settings surface with separate reviewed delete request and confirmation', () => {
  const reviewedTarget = '00000000-0000-4000-8000-000000000001'
  for (const kind of ['delete-request', 'delete-confirm', 'delete-cancel']) {
    expect(
      SparsePresetViewerParams.safeParse({
        viewer: 'desktop',
        surface: 'settings',
        repoId: 'repo',
        action: { kind, reviewedTarget, presetId: 'preset' }
      }).success
    ).toBe(true)
  }
})
