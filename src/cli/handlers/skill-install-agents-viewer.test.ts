import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { MANAGED_SKILL_HANDLERS } from './skills-managed'
import { dispatch } from '../dispatch'
import { parseArgs } from '../args'
import { COMMAND_SPECS } from '../specs'
import { RuntimeClient } from '../runtime-client'

it.each(['install-form', 'bundle-form'] as const)(
  'validates %s agent controls and propagates old-peer errors',
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-skill-agents-viewer-'))
    const client = new RuntimeClient('/unused-skill-agents-viewer-fixture')
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
      ['skills', 'viewer', '--viewer', 'desktop', '--input-file', file, '--json'],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    const reviewedTarget = '00000000-0000-4000-8000-000000000001'
    try {
      for (const leaf of [
        { kind: 'get' },
        { kind: 'open', reviewedTarget, value: true },
        { kind: 'provider', reviewedTarget, provider: 'cursor', checked: true },
        { kind: 'select-all', reviewedTarget, checked: false }
      ]) {
        const action = { kind, action: { kind: 'agents-form', action: leaf } }
        await writeFile(file, JSON.stringify(action))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith('skills.viewerAction', {
          viewer: 'desktop',
          action
        })
        call.mockClear()
        await writeFile(
          file,
          JSON.stringify({
            ...action,
            action: { kind: 'agents-form', action: { ...leaf, force: true } }
          })
        )
        await expect(MANAGED_SKILL_HANDLERS['skills viewer']!(context)).rejects.toMatchObject({
          code: 'invalid_argument'
        })
        expect(call).not.toHaveBeenCalled()
      }
      for (const leaf of [
        { kind: 'provider', reviewedTarget, provider: 'unknown', checked: true },
        { kind: 'provider', reviewedTarget: 'invalid', provider: 'cursor', checked: true },
        { kind: 'select-all', reviewedTarget, checked: 'true' },
        { kind: 'open', value: true }
      ]) {
        await writeFile(
          file,
          JSON.stringify({ kind, action: { kind: 'agents-form', action: leaf } })
        )
        await expect(MANAGED_SKILL_HANDLERS['skills viewer']!(context)).rejects.toMatchObject({
          code: 'invalid_argument'
        })
        expect(call).not.toHaveBeenCalled()
      }
    } finally {
      call.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  }
)
