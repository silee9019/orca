import { describe, expect, it, vi } from 'vitest'
import { invokePluginWorkerCommand } from './plugin-command-invocation'
import { pluginManifestSchema } from '../../shared/plugins/plugin-manifest'
import type { ValidDiscoveredPlugin } from './plugin-discovery'

const plugin: ValidDiscoveredPlugin = {
  pluginKey: 'fixture.cli',
  rootDir: '/fixture',
  isDev: true,
  contentHash: null,
  consentFingerprint: 'fixture',
  manifest: pluginManifestSchema.parse({
    manifestVersion: 1,
    id: 'cli',
    publisher: 'fixture',
    name: 'fixture',
    version: '1.0.0',
    engines: { orca: '>=1.0.0' },
    pluginApi: 1,
    main: 'main.mjs',
    contributes: {
      commands: [
        { id: 'legacy', title: 'Legacy' },
        {
          id: 'input',
          title: 'Input',
          input: { fields: { value: { type: 'number', required: true, minimum: 1, maximum: 3 } } }
        }
      ]
    }
  })
}

describe('worker input version boundary', () => {
  it('preserves legacy workers and refuses input on workers without negotiated support', async () => {
    const invokeCommand = vi.fn(async () => 'legacy-effect')
    const ensure = vi.fn(async () => ({ commands: ['legacy', 'input'], invokeCommand }))
    await expect(invokePluginWorkerCommand(plugin, 'legacy', undefined, ensure)).resolves.toBe(
      'legacy-effect'
    )
    invokeCommand.mockClear()
    await expect(invokePluginWorkerCommand(plugin, 'input', { value: 2 }, ensure)).rejects.toThrow(
      'does not support'
    )
    expect(invokeCommand).not.toHaveBeenCalled()
    ensure.mockClear()
    await expect(invokePluginWorkerCommand(plugin, 'input', { value: 4 }, ensure)).rejects.toThrow(
      'Invalid'
    )
    expect(ensure).not.toHaveBeenCalled()
  })
})
