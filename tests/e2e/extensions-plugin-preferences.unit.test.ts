import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from '../../src/cli/args'
import { dispatch } from '../../src/cli/dispatch'
import { COMMAND_SPECS } from '../../src/cli/specs'
import { RuntimeClient } from '../../src/cli/runtime-client'
import {
  updateManagedPluginPreferences,
  projectPluginPreferences
} from '../../src/main/plugins/plugin-management'

afterEach(() => vi.restoreAllMocks())

it('dispatches validated plugin preference input to a host writer and reads the persisted projection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-plugin-preferences-cli-'))
  try {
    let settings: { pluginSystemEnabled: boolean; devPluginPaths: string[]; cloudSecret: string } =
      {
        pluginSystemEnabled: false,
        devPluginPaths: [],
        cloudSecret: 'fixture-private'
      }
    const file = join(root, 'settings.json')
    const store = {
      getSettings: () => settings,
      updateSettings: (updates: { pluginSystemEnabled?: boolean; devPluginPaths?: string[] }) => {
        settings = { ...settings, ...updates }
      },
      flushPendingOrThrowAsync: async () => {
        await writeFile(file, JSON.stringify(settings))
      }
    }
    const refresh = vi.fn(async () => {})
    const client = new RuntimeClient('/unused-plugin-preference-host')
    const call = vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
      const result =
        method === 'plugins.updatePreferences'
          ? await updateManagedPluginPreferences(store, { refresh }, params)
          : method === 'plugins.getPreferences'
            ? projectPluginPreferences(settings)
            : null
      if (result === null) {
        throw new Error(`unexpected fixture method: ${method}`)
      }
      return { id: 'preferences', ok: true, result, _meta: { runtimeId: 'fixture-host' } }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const input = join(root, 'input.json')
    await writeFile(
      input,
      JSON.stringify({ pluginSystemEnabled: true, devPluginPaths: ['/runtime/plugins'] })
    )
    const update = parseArgs(
      ['plugins', 'preferences', 'update', '--input-file', input, '--json'],
      COMMAND_SPECS.map((spec) => spec.path),
      COMMAND_SPECS
    )
    await dispatch(update.commandPath, { client, cwd: root, json: true, flags: update.flags })
    expect(call).toHaveBeenCalledWith(
      'plugins.updatePreferences',
      { pluginSystemEnabled: true, devPluginPaths: ['/runtime/plugins'] },
      { timeoutMs: 600000 }
    )
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      pluginSystemEnabled: true,
      devPluginPaths: ['/runtime/plugins']
    })
    expect(refresh).toHaveBeenCalledOnce()
    const get = parseArgs(['plugins', 'preferences', 'get', '--json'])
    await dispatch(get.commandPath, { client, cwd: root, json: true, flags: get.flags })
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).result).toEqual({
      pluginSystemEnabled: true,
      devPluginPaths: ['/runtime/plugins']
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('fixture-private')
    await writeFile(input, JSON.stringify({ pluginConsents: {} }))
    await expect(
      dispatch(update.commandPath, { client, cwd: root, json: true, flags: update.flags })
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).toHaveBeenCalledTimes(2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
