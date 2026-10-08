import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  invokePluginPanelAction,
  inspectPluginPanel
} from '../../src/main/runtime/rpc/methods/plugins'
import { PluginService } from '../../src/main/plugins/plugin-service'
import { pluginManifestSchema } from '../../src/shared/plugins/plugin-manifest'
import { fingerprintPluginConsent } from '../../src/shared/plugins/plugin-consent-fingerprint'
import { listPluginsForClients } from '../../src/main/plugins/plugin-client-list'
import { PLUGIN_HANDLERS } from '../../src/cli/handlers/plugins'
import { RuntimeClient } from '../../src/cli/runtime-client'

const roots: string[] = []
const services: PluginService[] = []
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.restoreAllMocks()
})

async function fixture(approved = true, panelCapability = true) {
  const root = await mkdtemp(join(tmpdir(), 'orca-extensions-command-'))
  roots.push(root)
  const pluginRoot = join(root, 'plugin')
  await mkdir(pluginRoot)
  const output = join(root, 'effect.json')
  const manifest = pluginManifestSchema.parse({
    manifestVersion: 1,
    id: 'cli',
    publisher: 'fixture',
    name: 'CLI fixture',
    version: '1.0.0',
    engines: { orca: '>=1.0.0' },
    pluginApi: 1,
    main: 'main.mjs',
    capabilities: panelCapability ? [{ kind: 'terminal:send' }] : [],
    contributes: {
      panels: [{ id: 'editor', title: 'Editor', entry: 'panel.html' }],
      commands: [
        { id: 'legacy', title: 'Legacy' },
        { id: 'panel-reset', title: 'Reset panel state' },
        {
          id: 'panel-save',
          title: 'Save panel state',
          input: { fields: { label: { type: 'string', required: true, maxLength: 16 } } }
        },
        {
          id: 'save',
          title: 'Save',
          input: {
            fields: {
              label: { type: 'string', required: true, maxLength: 16 },
              enabled: { type: 'boolean' }
            }
          }
        }
      ]
    }
  })
  await writeFile(
    join(pluginRoot, 'panel.html'),
    `<input id="label" maxlength="16"><button id="save">Save</button><button id="reset">Reset</button>
    <script>
      function send(text) { parent.postMessage({ type: 'orca-panel-action', requestId: 'fixture', action: 'terminal.sendText', params: { terminalId: 'fixture-terminal', text, enter: false } }, '*') }
      document.getElementById('save').onclick = () => send('save:' + document.getElementById('label').value)
      document.getElementById('reset').onclick = () => send('reset')
    </script>`
  )

  await writeFile(join(pluginRoot, 'orca-plugin.json'), JSON.stringify(manifest))
  await writeFile(
    join(pluginRoot, 'main.mjs'),
    `
    import { writeFile } from 'node:fs/promises'
    export default function activate(orca) {
      orca.commands.register('panel-save', (args) => orca.host.call('terminal.sendText', { terminalId: 'fixture-terminal', text: 'save:' + args.label, enter: false }))
      orca.commands.register('panel-reset', () => orca.host.call('terminal.sendText', { terminalId: 'fixture-terminal', text: 'reset', enter: false }))
      orca.commands.register('legacy', async () => {
        await writeFile(${JSON.stringify(output)}, JSON.stringify({ legacy: true }))
        return { saved: true }
      })
      orca.commands.register('save', async (args) => {
        await writeFile(${JSON.stringify(output)}, JSON.stringify(args))
        return { saved: true }
      })
    }
  `
  )
  const hostEntryPath = join(root, 'plugin-host-entry.cjs')
  await build({
    entryPoints: [join(process.cwd(), 'src/main/plugins/plugin-host-entry.ts')],
    outfile: hostEntryPath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent'
  })
  const service = new PluginService({
    userDataPath: root,
    hostVersion: '1.4.214',
    hostEntryPath,
    isPluginSystemEnabled: () => true,
    getDevPluginPaths: () => [pluginRoot],
    getDisabledPlugins: () => [],
    getPluginConsents: (): Record<string, string> =>
      approved ? { 'fixture.cli': fingerprintPluginConsent(manifest) } : {}
  })
  service.setRuntimeDelegate({
    resolveActiveWorktreeContext: async () => ({
      worktreeId: 'fixture-folder',
      path: root,
      branch: '',
      displayName: 'fixture folder'
    }),
    listTerminals: async () => ({ terminals: [{ handle: 'fixture-terminal', title: 'fixture' }] }),
    sendTerminal: async (handle, action) => {
      const effect =
        action.text === 'reset'
          ? {}
          : action.text.startsWith('save:')
            ? { label: action.text.slice(5) }
            : { handle, ...action }
      await writeFile(output, JSON.stringify(effect))
      return { accepted: true }
    },
    dispatchPluginNotification: async () => ({ delivered: false })
  })
  services.push(service)
  await service.initialize()
  const client = new RuntimeClient(root)
  const calls: string[] = []
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    calls.push(method)
    const result =
      method === 'plugins.list'
        ? await listPluginsForClients(service)
        : await service.invokeCommand(
            'fixture.cli',
            typeof params === 'object' &&
              params &&
              'commandId' in params &&
              typeof params.commandId === 'string'
              ? params.commandId
              : '',
            typeof params === 'object' && params && 'args' in params ? params.args : undefined
          )
    return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'isolated' } }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const handler = PLUGIN_HANDLERS['plugins command']
  if (!handler) {
    throw new Error('Missing CLI command')
  }
  const run = async (command: string, args?: unknown) => {
    const flags = new Map<string, string | boolean>([
      ['plugin', 'fixture.cli'],
      ['command', command]
    ])
    if (args !== undefined) {
      const file = join(root, 'input.json')
      await writeFile(file, JSON.stringify(args))
      flags.set('input-file', file)
    }
    await handler({ flags, client, json: true, cwd: root })
  }
  return { root, service, output, calls, run }
}

describe('CLI to real plugin worker', () => {
  it('runs a legacy command and a declared-input command with durable effects', async () => {
    const f = await fixture()
    await f.run('legacy')
    expect(JSON.parse(await readFile(f.output, 'utf8'))).toEqual({ legacy: true })
    await f.run('save', { label: '한글 fixture', enabled: false })
    expect(JSON.parse(await readFile(f.output, 'utf8'))).toEqual({
      label: '한글 fixture',
      enabled: false
    })
    expect(f.calls).toEqual([
      'plugins.list',
      'plugins.invokeCommand',
      'plugins.list',
      'plugins.invokeCommand'
    ])
  })

  it('maps panel save and reset to explicit commands with the same durable provider effect', async () => {
    const f = await fixture()
    await f.run('panel-save', { label: 'saved' })
    expect(JSON.parse(await readFile(f.output, 'utf8'))).toEqual({ label: 'saved' })
    await invokePluginPanelAction(
      f.service,
      {
        pluginKey: 'fixture.cli',
        panelId: 'editor',
        action: 'terminal.sendText',
        params: { terminalId: 'fixture-terminal', text: 'reset', enter: false }
      },
      {}
    )
    expect(JSON.parse(await readFile(f.output, 'utf8'))).toEqual({})
    await invokePluginPanelAction(
      f.service,
      {
        pluginKey: 'fixture.cli',
        panelId: 'editor',
        action: 'terminal.sendText',
        params: { terminalId: 'fixture-terminal', text: 'save:panel', enter: false }
      },
      {}
    )
    expect(JSON.parse(await readFile(f.output, 'utf8'))).toEqual({ label: 'panel' })
    await f.run('panel-reset')
    expect(JSON.parse(await readFile(f.output, 'utf8'))).toEqual({})
    const audit = await readFile(join(f.root, 'plugins-data', 'audit.log'), 'utf8')
    expect(audit.trim().split('\n')).toHaveLength(8)
    expect(Buffer.byteLength(audit)).toBeLessThan(4096)
  })

  it('reads panel source without leaking a live session token', async () => {
    const f = await fixture()
    const revoke = vi.spyOn(f.service.panels, 'revokeOwner')
    const result = await inspectPluginPanel(
      f.service,
      { pluginKey: 'fixture.cli', panelId: 'editor' },
      {}
    )
    expect(result.html).toContain('id="save"')
    expect(Object.keys(result)).toEqual(['html'])
    expect(revoke).toHaveBeenCalledOnce()
  })

  it('refuses invalid input before a worker starts or a file changes', async () => {
    const f = await fixture()
    await expect(f.run('save', { label: 1 })).rejects.toThrow('Invalid plugin command input')
    await expect(f.run('legacy', { unexpected: true })).rejects.toThrow(
      'no declared input contract'
    )
    expect(f.calls).toEqual(['plugins.list', 'plugins.list'])
    expect(f.service.workerState('fixture.cli').state).toBe('inactive')
    await expect(readFile(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(f.service.invokeCommand('fixture.cli', 'save', { label: 1 })).rejects.toThrow(
      'Invalid plugin command input'
    )
    expect(f.service.workerState('fixture.cli').state).toBe('inactive')
  })

  it('refuses unconsented commands before any worker starts', async () => {
    const f = await fixture(false)
    await expect(f.run('legacy')).rejects.toThrow('not enabled')
    expect(f.service.workerState('fixture.cli').state).toBe('inactive')
    await expect(readFile(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('executes a panel write through the existing capability gate and revokes the owner', async () => {
    const f = await fixture()
    const revoke = vi.spyOn(f.service.panels, 'revokeOwner')
    const params = {
      pluginKey: 'fixture.cli',
      panelId: 'editor',
      action: 'terminal.sendText',
      params: { terminalId: 'fixture-terminal', text: 'fixture text', enter: false }
    }
    await expect(
      invokePluginPanelAction(f.service, params, { connectionId: 'fixture-connection' })
    ).resolves.toEqual({ ok: true, value: { accepted: true } })
    expect(JSON.parse(await readFile(f.output, 'utf8'))).toEqual({
      handle: 'fixture-terminal',
      text: 'fixture text',
      enter: false
    })
    expect(revoke).toHaveBeenCalledOnce()
    expect(revoke.mock.calls[0]?.[0]).toMatch(/^runtime:fixture-connection:command:/)
  })

  it('refuses a panel write without its consented capability', async () => {
    const f = await fixture(true, false)
    await expect(
      invokePluginPanelAction(
        f.service,
        {
          pluginKey: 'fixture.cli',
          panelId: 'editor',
          action: 'terminal.sendText',
          params: { terminalId: 'fixture-terminal', text: 'must not write' }
        },
        {}
      )
    ).resolves.toMatchObject({ ok: false, code: 'capability_denied' })
    await expect(readFile(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not open a panel after owner cancellation', async () => {
    const f = await fixture()
    const controller = new AbortController()
    controller.abort()
    const open = vi.spyOn(f.service.panels, 'open')
    await expect(
      invokePluginPanelAction(
        f.service,
        {
          pluginKey: 'fixture.cli',
          panelId: 'editor',
          action: 'terminal.sendText',
          params: {}
        },
        { signal: controller.signal }
      )
    ).rejects.toThrow('cancelled')
    expect(open).not.toHaveBeenCalled()
    await expect(readFile(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
