import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { createServer, type Socket } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RuntimeClientSettingsController } from '../../src/main/runtime/runtime-client-settings'
import { RuntimeSettingsActions } from '../../src/main/runtime/runtime-settings-actions'
import { KeybindingService } from '../../src/main/keybindings/keybinding-service'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { SETTINGS_CONTROL_METHODS } from '../../src/main/runtime/rpc/methods/settings-control'
import { createGlobalSettingsFixture } from '../../src/shared/global-settings-test-fixture'
import { main } from '../../src/cli/index'

vi.mock('../../src/cli/specs', async () => ({
  COMMAND_SPECS: (await import('../../src/cli/specs/settings.js')).SETTINGS_COMMAND_SPECS
}))
vi.mock('../../src/cli/handler-group-manifest', async () => {
  const { SETTINGS_HANDLERS } = await import('../../src/cli/handlers/settings.js')
  return {
    HANDLER_GROUPS: [
      {
        name: 'settings',
        keys: Object.keys(SETTINGS_HANDLERS),
        load: async () => SETTINGS_HANDLERS
      }
    ]
  }
})

const Request = z.object({
  id: z.string(),
  authToken: z.string(),
  method: z.string(),
  params: z.unknown().optional()
})

it('runs the CLI through an isolated socket and reads back profile and shortcut files outside Git', async () => {
  const home = await mkdtemp(join(tmpdir(), 'orca-set-'))
  const endpoint =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\orca-settings-${process.pid}`
      : join(home, 'rpc.sock')
  const profile = join(home, 'profile.json')
  let settings = createGlobalSettingsFixture({ machineName: 'fixture-host', theme: 'light' })
  const keybindings = new KeybindingService({ homePath: home, platform: process.platform })
  const changed = vi.fn()
  const actions = new RuntimeSettingsActions({
    getKeybindings: () => keybindings,
    onKeybindingsChanged: changed,
    listFonts: async () => ['Fixture Font'],
    getSettings: () => settings,
    applySettings: async (updates) => {
      settings = { ...settings, ...updates }
      await writeFile(profile, JSON.stringify(settings))
      return settings
    }
  })
  const controller = new RuntimeClientSettingsController({
    getSettings: () => settings,
    updateSettings: (updates) => {
      settings = { ...settings, ...updates }
      writeFileSync(profile, JSON.stringify(settings))
      return settings
    }
  })
  const runtime = new OrcaRuntimeService(null, undefined, { settingsActions: actions })
  vi.spyOn(runtime, 'getClientSettings').mockImplementation(() => controller.get())
  vi.spyOn(runtime, 'updateClientSettings').mockImplementation((updates) =>
    controller.update(updates)
  )
  const dispatcher = new RpcDispatcher({ runtime, methods: SETTINGS_CONTROL_METHODS })
  const sockets = new Set<Socket>()
  const methods: string[] = []
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      if (!buffer.includes('\n')) {
        return
      }
      const request = Request.parse(JSON.parse(buffer.split('\n')[0] ?? ''))
      expect(request.authToken).toBe('fixture-token')
      methods.push(request.method)
      void dispatcher
        .dispatch(request)
        .then((response) => socket.end(`${JSON.stringify(response)}\n`))
    })
  })
  const exitCode = process.exitCode
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    server.listen(endpoint)
    await once(server, 'listening')
    await writeFile(
      join(home, 'orca-runtime.json'),
      JSON.stringify({
        runtimeId: runtime.getRuntimeId(),
        pid: process.pid,
        authToken: 'fixture-token',
        startedAt: Date.now(),
        transports: [{ kind: process.platform === 'win32' ? 'named-pipe' : 'unix', endpoint }]
      })
    )
    vi.stubEnv('ORCA_USER_DATA_PATH', home)
    vi.stubEnv('ORCA_ENVIRONMENT', '')
    vi.stubEnv('ORCA_PAIRING_CODE', '')
    const invoke = async (args: string[]) => {
      log.mockClear()
      process.exitCode = 0
      await main(['settings', ...args, '--json'], home)
      expect(process.exitCode).toBe(0)
      return JSON.parse(String(log.mock.calls[0]?.[0]))
    }
    await writeFile(
      join(home, 'update.json'),
      JSON.stringify({
        theme: 'dark',
        localBaseRefSuggestionDismissed: true,
        opencodeSessionCookie: 'secret-canary'
      })
    )
    const desktop = await invoke(['desktop', 'update', '--file', 'update.json'])
    expect(desktop.result).toMatchObject({
      settings: { theme: 'dark', localBaseRefSuggestionDismissed: true },
      persisted: true,
      rendered: false
    })
    expect(JSON.stringify(desktop)).not.toContain('canary')
    expect(JSON.parse(await readFile(profile, 'utf8'))).toMatchObject({
      theme: 'dark',
      localBaseRefSuggestionDismissed: true,
      opencodeSessionCookie: 'secret-canary'
    })
    expect((await invoke(['desktop', 'get'])).result.settings).toMatchObject({
      theme: 'dark',
      localBaseRefSuggestionDismissed: true
    })
    await writeFile(join(home, 'update.json'), JSON.stringify({ machineName: 'updated-fixture' }))
    expect((await invoke(['update', '--file', 'update.json'])).result.settings.machineName).toBe(
      'updated-fixture'
    )
    expect(JSON.parse(await readFile(profile, 'utf8')).machineName).toBe('updated-fixture')
    await writeFile(
      join(home, 'shortcut.json'),
      JSON.stringify({ actionId: 'app.settings', bindings: ['Ctrl+Alt+Shift+F12'] })
    )
    await invoke(['keybindings', 'set', '--file', 'shortcut.json'])
    expect(
      JSON.parse(await readFile(keybindings.getPath(), 'utf8')).platforms[process.platform][
        'app.settings'
      ]
    ).toEqual(['Ctrl+Alt+Shift+F12'])
    await invoke(['keybindings', 'reload'])
    expect(changed).toHaveBeenCalledTimes(2)
    expect((await invoke(['fonts'])).result.fonts).toEqual(['Fixture Font'])
    expect(methods).toEqual([
      'settings.desktop.update',
      'settings.desktop.get',
      'settings.control.update',
      'keybindings.setAction',
      'keybindings.reload',
      'settings.control.listFonts'
    ])
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    process.exitCode = exitCode
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await rm(home, { recursive: true, force: true })
  }
})
