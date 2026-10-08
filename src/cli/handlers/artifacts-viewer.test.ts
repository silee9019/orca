import { PLUGIN_MANAGEMENT_HANDLERS } from './plugins-management'
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
  ['skills', MANAGED_SKILL_HANDLERS, 'skills.viewerAction'],
  ['plugins', PLUGIN_MANAGEMENT_HANDLERS, 'plugins.viewerAction']
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
          : command === 'plugins'
            ? { kind: 'get' }
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
        for (const action of [
          { kind: 'close' },
          { kind: 'delete-selected' },
          { kind: 'delete-result-dismiss' },
          {
            kind: 'delete-confirmation',
            operationId: '00000000-0000-4000-8000-000000000001',
            confirmed: true
          }
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
          { kind: 'delete-confirmation', operationId: 'invalid', confirmed: true },
          {
            kind: 'delete-confirmation',
            operationId: '00000000-0000-4000-8000-000000000001',
            confirmed: 'true'
          }
        ]) {
          await writeFile(file, JSON.stringify(action))
          await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
            code: 'invalid_argument'
          })
          expect(call).not.toHaveBeenCalled()
        }
      }
      if (command === 'artifacts') {
        const action = {
          kind: 'publish-form',
          sourceKey: '/fixture/report.md',
          action: { kind: 'publish', reviewedTarget: '00000000-0000-4000-8000-000000000001' }
        }
        await writeFile(file, JSON.stringify(action))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, { viewer: 'desktop', action })
        call.mockClear()
        const detailAction = {
          kind: 'copy-link',
          slug: 'report-123',
          reviewedTarget: action.action.reviewedTarget,
          reviewedLink: 'https://example.com/a/fixture'
        }
        await writeFile(file, JSON.stringify(detailAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: detailAction
        })
        call.mockClear()
        for (const deleteAction of [
          { ...detailAction, kind: 'delete' },
          {
            kind: 'delete-confirmation',
            slug: detailAction.slug,
            reviewedTarget: detailAction.reviewedTarget,
            confirmed: true
          }
        ]) {
          await writeFile(file, JSON.stringify(deleteAction))
          await expect(
            dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
          ).rejects.toThrow('unknown method')
          expect(call).toHaveBeenCalledExactlyOnceWith(method, {
            viewer: 'desktop',
            action: deleteAction
          })
          call.mockClear()
        }
        const linkAction = {
          ...action,
          action: {
            kind: 'copy-link',
            reviewedTarget: action.action.reviewedTarget,
            reviewedLink: 'https://example.com/a/fixture'
          }
        }
        await writeFile(file, JSON.stringify(linkAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: linkAction
        })
        call.mockClear()
        for (const invalid of [
          { ...detailAction, kind: 'delete', force: true },
          {
            kind: 'delete-confirmation',
            slug: detailAction.slug,
            reviewedTarget: detailAction.reviewedTarget,
            confirmed: 'true'
          },
          { ...detailAction, reviewedLink: 'x'.repeat(8193) },
          { ...detailAction, reviewedTarget: 'invalid-target' },
          { ...detailAction, authToken: 'fixture-secret' },
          { kind: 'connect', content: 'untrusted' },
          { ...linkAction, action: { ...linkAction.action, reviewedLink: 'x'.repeat(8193) } },
          { ...linkAction, action: { ...linkAction.action, content: 'untrusted' } },
          { ...action, sourceKey: 'x'.repeat(4097) },
          { ...action, action: { kind: 'publish', reviewedTarget: 'not-a-target' } },
          { ...action, action: { ...action.action, content: 'untrusted replacement' } },
          { ...action, action: { kind: 'eval' } }
        ]) {
          await writeFile(file, JSON.stringify(invalid))
          await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
            code: 'invalid_argument'
          })
          expect(call).not.toHaveBeenCalled()
        }
      }
      if (command === 'plugins') {
        const marketplaceAction = {
          kind: 'marketplace-form',
          action: { kind: 'source-form', action: { kind: 'refresh', sourceId: 'a'.repeat(32) } }
        }
        await writeFile(file, JSON.stringify(marketplaceAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: marketplaceAction
        })
        call.mockClear()
        for (const action of [
          { kind: 'url', value: 'x'.repeat(4097) },
          { kind: 'remove', sourceId: '../arbitrary' },
          { kind: 'eval' }
        ]) {
          await writeFile(
            file,
            JSON.stringify({ kind: 'marketplace-form', action: { kind: 'source-form', action } })
          )
          await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
            code: 'invalid_argument'
          })
          expect(call).not.toHaveBeenCalled()
        }
        const previewAction = {
          kind: 'marketplace-form',
          action: {
            kind: 'preview-form',
            action: {
              kind: 'confirm',
              marketplaceSourceId: 'a'.repeat(32),
              pluginKey: 'fixture.notes',
              marketplaceCommit: 'b'.repeat(40),
              resolvedCommit: 'c'.repeat(40),
              contentHash: 'reviewed-content'
            }
          }
        }
        await writeFile(file, JSON.stringify(previewAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: previewAction
        })
        call.mockClear()
        for (const action of [
          { ...previewAction.action.action, marketplaceCommit: 'b'.repeat(39) },
          { ...previewAction.action.action, contentHash: 'x'.repeat(257) },
          { ...previewAction.action.action, pluginKey: '../arbitrary' }
        ]) {
          await writeFile(
            file,
            JSON.stringify({ kind: 'marketplace-form', action: { kind: 'preview-form', action } })
          )
          await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
            code: 'invalid_argument'
          })
          expect(call).not.toHaveBeenCalled()
        }
        const developmentAction = {
          kind: 'development-form',
          action: { kind: 'input', value: '/fixture/notes' }
        }
        await writeFile(file, JSON.stringify(developmentAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: developmentAction
        })
        call.mockClear()
        await writeFile(
          file,
          JSON.stringify({
            kind: 'development-form',
            action: { kind: 'input', value: 'x'.repeat(4097) }
          })
        )
        await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
          code: 'invalid_argument'
        })
        expect(call).not.toHaveBeenCalled()
        const installAction = { kind: 'install-form', action: { kind: 'submit' } }
        await writeFile(file, JSON.stringify(installAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: installAction
        })
        call.mockClear()
        for (const action of [
          { kind: 'source-kind', value: 'eval' },
          { kind: 'git-url', value: 'x'.repeat(4097) }
        ]) {
          await writeFile(file, JSON.stringify({ kind: 'install-form', action }))
          await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
            code: 'invalid_argument'
          })
          expect(call).not.toHaveBeenCalled()
        }
        const confirmation = {
          kind: 'confirm',
          dialog: 'remove',
          pluginKey: 'fixture.notes',
          version: '1.0.0'
        }
        await writeFile(file, JSON.stringify(confirmation))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: confirmation
        })
        call.mockClear()
        const action = {
          kind: 'consent-form',
          action: {
            kind: 'decide',
            pluginKey: 'fixture.notes',
            reviewedFingerprint: 'reviewed-notes',
            decision: 'keep-disabled'
          }
        }
        await writeFile(file, JSON.stringify(action))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, { viewer: 'desktop', action })
        call.mockClear()
        for (const invalid of [
          { ...action.action, decision: 'eval' },
          { ...action.action, reviewedFingerprint: 'x'.repeat(257) }
        ]) {
          await writeFile(file, JSON.stringify({ kind: 'consent-form', action: invalid }))
          await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
            code: 'invalid_argument'
          })
          expect(call).not.toHaveBeenCalled()
        }
      }
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
        const linksAction = {
          kind: 'links-form',
          action: { kind: 'confirm', id: 'shr_fixture', value: 'delete' }
        }
        await writeFile(file, JSON.stringify(linksAction))
        await expect(
          dispatch(parsed.commandPath, { ...context, flags: parsed.flags })
        ).rejects.toThrow('unknown method')
        expect(call).toHaveBeenCalledExactlyOnceWith(method, {
          viewer: 'desktop',
          action: linksAction
        })
        call.mockClear()
        await writeFile(
          file,
          JSON.stringify({
            kind: 'links-form',
            action: { kind: 'execute', id: 'shr_fixture', operation: 'eval' }
          })
        )
        await expect(handlers[`${command} viewer`]!(context)).rejects.toMatchObject({
          code: 'invalid_argument'
        })
        expect(call).not.toHaveBeenCalled()
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
