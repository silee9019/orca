import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SPARSE_PRESET_HANDLERS } from '../../src/cli/handlers/sparse-presets'
import { MANAGED_SKILL_HANDLERS } from '../../src/cli/handlers/skills-managed'
import { AUTOMATION_EXTENSION_HANDLERS } from '../../src/cli/handlers/automation-extensions'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { RuntimeRepositorySparsePresets } from '../../src/main/runtime/runtime-repository-sparse-presets'
import { RepoSparsePresetSave } from '../../src/shared/rpc-contract/repo-params'
import { SparsePresetRemoveParams } from '../../src/shared/rpc-contract/sparse-preset-params'
import type { SparsePreset } from '../../src/shared/worktree/create-types'
import { SkillSharePreparationService } from '../../src/main/skills/skill-share-preparation-service'
import {
  skillSharePrepareIpcSchema,
  SkillPreparationIdParams
} from '../../src/shared/rpc-contract/skills-lifecycle-params'
import { ExternalAutomationActionParams } from '../../src/shared/rpc-contract/automation-extensions-params'
import { createScopedExternalAutomations } from '../../src/main/automations/external-manager'
import { ExternalAutomationManagerCache } from '../../src/main/automations/external-automation-manager-cache'
import { ExternalAutomationProbeScheduler } from '../../src/main/automations/external-automation-probe-scheduler'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'orca-extensions-managed-'))
  roots.push(root)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  return { root, client: new RuntimeClient(root) }
}
async function run(
  handler: (typeof SPARSE_PRESET_HANDLERS)[string] | undefined,
  client: RuntimeClient,
  root: string,
  input: unknown
) {
  if (!handler) {
    throw new Error('Missing handler')
  }
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(input))
  await handler({ flags: new Map([['input-file', file]]), client, cwd: root, json: true })
}

describe('extensions managed effects on isolated fixtures', () => {
  it('saves and removes only the preset owned by the exact selected repository', async () => {
    const { root, client } = await fixture()
    const output = join(root, 'presets.json')
    let presets: SparsePreset[] = []
    const changed = vi.fn()
    const service = new RuntimeRepositorySparsePresets({
      changed,
      resolveRepo: async (selector) => {
        if (selector !== 'fixture-folder') {
          throw new Error('Unknown repository')
        }
        return {
          id: 'fixture-folder',
          path: root,
          displayName: 'fixture',
          badgeColor: '#000',
          addedAt: 0
        }
      },
      getStore: () => ({
        getSparsePresets: (repoId) => presets.filter((preset) => preset.repoId === repoId),
        saveSparsePreset: (preset) => {
          presets = [...presets.filter((value) => value.id !== preset.id), preset]
          writeFileSync(output, JSON.stringify(presets))
          return preset
        },
        removeSparsePreset: (repoId, id) => {
          presets = presets.filter((preset) => preset.repoId !== repoId || preset.id !== id)
          writeFileSync(output, JSON.stringify(presets))
        }
      })
    })
    vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
      let result: unknown
      if (method === 'repo.saveSparsePreset') {
        const parsed = RepoSparsePresetSave.parse(params)
        result = await service.save(parsed.repo, parsed)
      } else {
        const parsed = SparsePresetRemoveParams.parse(params)
        result = await service.remove(parsed.repo, parsed.presetId)
      }
      return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } }
    })
    await run(SPARSE_PRESET_HANDLERS['sparse-presets save'], client, root, {
      repo: 'fixture-folder',
      name: 'web',
      directories: ['packages/web']
    })
    expect(JSON.parse(await readFile(output, 'utf8'))).toMatchObject([
      { directories: ['packages/web'] }
    ])
    const preset = presets[0]
    if (!preset) {
      throw new Error('Preset was not saved')
    }
    await expect(service.remove('fixture-folder', 'wrong-id')).rejects.toThrow('not found')
    const remove = SPARSE_PRESET_HANDLERS['sparse-presets remove']
    if (!remove) {
      throw new Error('Missing remove')
    }
    await remove({
      client,
      cwd: root,
      json: true,
      flags: new Map([
        ['repo', 'fixture-folder'],
        ['preset', preset.id]
      ])
    })
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual([])
    expect(changed.mock.calls).toEqual([['fixture-folder'], ['fixture-folder']])
  })

  it('prepares and releases a real archive without publishing to any account', async () => {
    const { root, client } = await fixture()
    const source = join(root, 'skill')
    await mkdir(source)
    await writeFile(
      join(source, 'SKILL.md'),
      '---\nname: fixture-skill\ndescription: Fixture skill\n---\nFixture.\n'
    )
    const publishVersion = vi.fn()
    const createShare = vi.fn()
    const preparationRoot = join(root, 'preparations')
    const service = new SkillSharePreparationService(preparationRoot, {
      publishVersion,
      createShare
    })
    let preparationId = ''
    vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
      let result: unknown
      if (method === 'skills.prepareShare') {
        const parsed = skillSharePrepareIpcSchema.parse(params)
        expect(parsed.skillIds).toEqual(['fixture-skill'])
        const preview = await service.prepare({
          sources: [{ id: 'fixture-skill', sourceDirectory: source }],
          bundleName: parsed.bundleName
        })
        preparationId = preview.preparationId
        result = preview
      } else {
        const parsed = SkillPreparationIdParams.parse(params)
        await service.release(parsed.preparationId)
        result = { released: true }
      }
      return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } }
    })
    await run(MANAGED_SKILL_HANDLERS['skills prepare-share'], client, root, {
      skillIds: ['fixture-skill'],
      bundleName: 'fixture-bundle'
    })
    expect(
      (await readFile(join(preparationRoot, preparationId, 'package.tar.gz'))).length
    ).toBeGreaterThan(0)
    expect(publishVersion).not.toHaveBeenCalled()
    expect(createShare).not.toHaveBeenCalled()
    await run(MANAGED_SKILL_HANDLERS['skills release-share'], client, root, { preparationId })
    expect(await readdir(preparationRoot)).toEqual([])
  })

  it('rejects a stale SSH automation owner before falling back to any local provider', async () => {
    const { root, client } = await fixture()
    const engine = createScopedExternalAutomations({
      registry: {
        getSshTargets: () => [
          {
            id: 'fixture-ssh',
            label: 'fixture',
            host: 'fixture.invalid',
            port: 22,
            username: 'fixture',
            generation: 4
          }
        ]
      },
      scheduler: new ExternalAutomationProbeScheduler(),
      cache: new ExternalAutomationManagerCache()
    })
    vi.spyOn(client, 'call').mockImplementation(async (_method, params) => {
      const result = await engine.runAction(ExternalAutomationActionParams.parse(params))
      return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } }
    })
    await expect(
      run(AUTOMATION_EXTENSION_HANDLERS['automations external action'], client, root, {
        owner: {
          authority: { kind: 'desktop' },
          selector: { kind: 'ssh', targetId: 'fixture-ssh', targetGeneration: 3 }
        },
        provider: 'hermes',
        jobId: 'exact-job',
        action: 'pause'
      })
    ).rejects.toThrow()
    expect(await readdir(root)).toEqual(['request.json'])
  })
})
