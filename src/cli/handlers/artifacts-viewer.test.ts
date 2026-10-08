import { MANAGED_SKILL_HANDLERS } from './skills-managed'
import { AUTOMATION_EXTENSION_HANDLERS } from './automation-extensions'
import { parseArgs } from '../args'
import { dispatch } from '../dispatch'
import { COMMAND_SPECS } from '../specs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { ARTIFACT_HANDLERS } from './artifacts'
import { RuntimeClient } from '../runtime-client'

it.each([
  ['artifacts', ARTIFACT_HANDLERS, 'artifacts.viewerAction'],
  ['automations', AUTOMATION_EXTENSION_HANDLERS, 'automation.viewerAction'],
  ['skills', MANAGED_SKILL_HANDLERS, 'skills.viewerAction']
] as const)(
  'validates the %s desktop viewer and propagates unavailable host errors',
  async (command, handlers, method) => {
    const root = await mkdtemp(join(tmpdir(), 'orca-artifact-viewer-'))
    const client = new RuntimeClient('/unused-artifact-viewer-fixture')
    const call = vi.spyOn(client, 'call').mockRejectedValue(new Error('unknown method'))
    const file = join(root, 'action.json')
    try {
      const action =
        command === 'skills'
          ? { kind: 'filter', value: { query: '보고서', sourceKind: 'all', agent: 'all' } }
          : { kind: 'query', value: '보고서' }
      await writeFile(file, JSON.stringify(action))
      const context = { client, cwd: root, json: true, flags: new Map([['input-file', file]]) }
      await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
        code: 'invalid_argument'
      })
      expect(call).not.toHaveBeenCalled()
      const parsed = parseArgs(
        [command, 'viewer', '--viewer', 'desktop', '--input-file', file, '--json'],
        COMMAND_SPECS.map((spec) => spec.path),
        COMMAND_SPECS
      )
      context.flags.set('viewer', 'desktop')
      await expect(
        dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
      ).rejects.toThrow('unknown method')
      expect(call).toHaveBeenCalledExactlyOnceWith(method, {
        viewer: 'desktop',
        action
      })
      call.mockClear()
      if (command === 'skills') {
        const action = { kind: 'install-form', action: { kind: 'providers', value: ['codex'] } }
        await writeFile(file, JSON.stringify(action))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, { viewer: 'desktop', action })
        call.mockClear()
        const bundleAction = {
          kind: 'bundle-form',
          action: { kind: 'select', id: 'skill-alpha', selected: false }
        }
        await writeFile(file, JSON.stringify(bundleAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: bundleAction
        })
        call.mockClear()
        const freshnessAction = {
          kind: 'freshness-form',
          action: { kind: 'update', names: ['orca-cli'] }
        }
        await writeFile(file, JSON.stringify(freshnessAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: freshnessAction
        })
        call.mockClear()
        await writeFile(
          file,
          JSON.stringify({ kind: 'freshness-form', action: { kind: 'update', names: [] } })
        )
        await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
          code: 'invalid_argument'
        })
        expect(call).not.toHaveBeenCalled()
        const listAction = { kind: 'list-form', action: { kind: 'detail', id: 'home:fixture' } }
        await writeFile(file, JSON.stringify(listAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: listAction
        })
        call.mockClear()
        await writeFile(
          file,
          JSON.stringify({ kind: 'list-form', action: { kind: 'detail-action', action: 'eval' } })
        )
        await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
          code: 'invalid_argument'
        })
        expect(call).not.toHaveBeenCalled()
        const shareAction = {
          kind: 'share-form',
          action: { kind: 'release-notes', value: '공유 기록' }
        }
        await writeFile(file, JSON.stringify(shareAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: shareAction
        })
        call.mockClear()
        await writeFile(
          file,
          JSON.stringify({
            kind: 'share-form',
            action: { kind: 'release-notes', value: '가'.repeat(10_001) }
          })
        )
        await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
          code: 'invalid_argument'
        })
        expect(call).not.toHaveBeenCalled()
        const managedAction = {
          kind: 'managed-form',
          action: { kind: 'remove', discardLocal: false }
        }
        await writeFile(file, JSON.stringify(managedAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: managedAction
        })
        call.mockClear()
        await writeFile(file, JSON.stringify({ kind: 'managed-form', action: { kind: 'remove' } }))
        await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
          code: 'invalid_argument'
        })
        expect(call).not.toHaveBeenCalled()
        await writeFile(
          file,
          JSON.stringify({
            kind: 'install-form',
            action: { kind: 'providers', value: ['unknown'] }
          })
        )
        await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
          code: 'invalid_argument'
        })
        expect(call).not.toHaveBeenCalled()
      }
      for (const action of [
        { kind: 'eval', value: 'arbitrary' },
        command === 'skills'
          ? { kind: 'filter', value: { query: '가'.repeat(700), sourceKind: 'all', agent: 'all' } }
          : { kind: 'query', value: '가'.repeat(700) }
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
  }
)
