import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { updateManagedPluginPreferences, projectPluginPreferences } from './plugin-management'

it('flushes only plugin preferences and reconciles workers before reporting applied', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-plugin-preferences-'))
  try {
    let settings = {
      pluginSystemEnabled: false,
      devPluginPaths: ['/old'],
      cloudSecret: 'fixture-secret'
    }
    const order: string[] = []
    const store = {
      getSettings: () => settings,
      updateSettings: (
        updates: { pluginSystemEnabled?: boolean; devPluginPaths?: string[] },
        options: { notifyListeners: true }
      ) => {
        expect(options.notifyListeners).toBe(true)
        settings = { ...settings, ...updates }
        order.push('write')
      },
      flushPendingOrThrowAsync: async () => {
        await writeFile(join(root, 'settings.json'), JSON.stringify(settings))
        order.push('flush')
      }
    }
    const service = {
      refresh: async () => {
        order.push('refresh')
      }
    }
    const result = await updateManagedPluginPreferences(store, service, {
      pluginSystemEnabled: true,
      devPluginPaths: ['/new']
    })
    expect(order).toEqual(['write', 'flush', 'refresh'])
    expect(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))).toEqual({
      pluginSystemEnabled: true,
      devPluginPaths: ['/new'],
      cloudSecret: 'fixture-secret'
    })
    expect(result).toEqual({
      preferences: { pluginSystemEnabled: true, devPluginPaths: ['/new'] },
      persisted: true,
      applied: true,
      rendered: false
    })
    expect(projectPluginPreferences(settings)).toEqual(result.preferences)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('rejects unrelated settings and invalid paths before any write', async () => {
  const updateSettings = vi.fn()
  const store = {
    getSettings: () => ({ pluginSystemEnabled: false, devPluginPaths: [] }),
    updateSettings,
    flushPendingOrThrowAsync: vi.fn()
  }
  await expect(
    updateManagedPluginPreferences(
      store,
      { refresh: vi.fn() },
      { pluginSystemEnabled: true, pluginConsents: {} }
    )
  ).rejects.toThrow()
  await expect(
    updateManagedPluginPreferences(store, { refresh: vi.fn() }, { devPluginPaths: [''] })
  ).rejects.toThrow()
  expect(updateSettings).not.toHaveBeenCalled()
})
