import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RuntimeClientSettingsController } from '../../src/main/runtime/runtime-client-settings'
import { RuntimeSettingsActions } from '../../src/main/runtime/runtime-settings-actions'
import { KeybindingService } from '../../src/main/keybindings/keybinding-service'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { CLIENT_UI_METHODS } from '../../src/main/runtime/rpc/methods/client-ui'
import { SETTINGS_CONTROL_METHODS } from '../../src/main/runtime/rpc/methods/settings-control'
import { MAX_QUICK_COMMANDS } from '../../src/shared/terminal-quick-commands'
import { createGlobalSettingsFixture } from '../../src/shared/global-settings-test-fixture'
import {
  RuntimeClient,
  RuntimeClientError,
  RuntimeRpcFailureError
} from '../../src/cli/runtime-client'
import { main } from '../../src/cli/index'
import { SETTINGS_HANDLERS } from '../../src/cli/handlers/settings'

const UPDATE = 'settings quick-commands update'
const LIST = 'settings quick-commands list'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-quick-commands-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

// A runtime host: real RPC handlers over an in-memory settings store, reached through the CLI client.
function createHost(runtimeId: string) {
  let settings = createGlobalSettingsFixture()
  const controller = new RuntimeClientSettingsController({
    getSettings: () => settings,
    updateSettings: (updates) => {
      settings = { ...settings, ...updates }
      return settings
    }
  })
  const actions = new RuntimeSettingsActions({
    getKeybindings: () =>
      new KeybindingService({ homePath: directory, platform: process.platform }),
    onKeybindingsChanged: () => {},
    listFonts: async () => [],
    getSettings: () => settings,
    applySettings: async (updates) => {
      settings = { ...settings, ...updates }
      return settings
    }
  })
  const runtime = new OrcaRuntimeService(null, undefined, { settingsActions: actions })
  vi.spyOn(runtime, 'getClientTerminalQuickCommands').mockImplementation(() =>
    controller.getTerminalQuickCommands()
  )
  vi.spyOn(runtime, 'updateClientTerminalQuickCommands').mockImplementation((mutation) =>
    controller.updateTerminalQuickCommands(mutation)
  )
  vi.spyOn(runtime, 'getRuntimeId').mockReturnValue(runtimeId)
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: [...CLIENT_UI_METHODS, ...SETTINGS_CONTROL_METHODS]
  })
  const calls: string[] = []
  return {
    calls,
    quickCommands: () => settings.terminalQuickCommands ?? [],
    async call(method: string, params?: unknown) {
      calls.push(method)
      const response = await dispatcher.dispatch({ id: 'req', authToken: 't', method, params })
      if (!response.ok) {
        throw new RuntimeRpcFailureError(response)
      }
      return response
    }
  }
}

type Host = ReturnType<typeof createHost>

function useHost(host: Host, remote: boolean) {
  vi.spyOn(RuntimeClient.prototype, 'call').mockImplementation((method, params) =>
    host.call(method, params)
  )
  vi.spyOn(RuntimeClient.prototype, 'isRemote', 'get').mockReturnValue(remote)
}

async function invoke(key: string, flags: Record<string, string | boolean> = {}) {
  const handler = SETTINGS_HANDLERS[key]
  if (!handler) {
    throw new Error(`Missing handler ${key}`)
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  log.mockClear()
  await handler({
    client: new RuntimeClient(directory, 1000, null, null),
    cwd: directory,
    flags: new Map(Object.entries(flags)),
    json: true
  })
  return log.mock.calls.length ? JSON.parse(String(log.mock.calls[0]?.[0])) : undefined
}

async function update(mutation: unknown, flags: Record<string, string | boolean> = {}) {
  await writeFile(join(directory, 'mutation.json'), JSON.stringify(mutation))
  return invoke(UPDATE, { file: 'mutation.json', ...flags })
}

const upsert = (id: string, command = `echo ${id}`) => ({
  type: 'upsert',
  command: { id, label: `Label ${id}`, command, appendEnter: true }
})

describe('settings quick-commands update', () => {
  it('upserts on the answering host and prints ids and labels without command bodies', async () => {
    const host = createHost('host-local')
    useHost(host, false)
    const output = await update(upsert('a', 'secret-canary --token'), { host: 'local' })
    expect(host.quickCommands()).toMatchObject([{ id: 'a', command: 'secret-canary --token' }])
    expect(output._meta.runtimeId).toBe('host-local')
    expect(output.result).toMatchObject({
      host: 'local',
      commands: [{ id: 'a', label: 'Label a' }]
    })
    expect(JSON.stringify(output)).not.toContain('canary')
  })

  it('writes only the targeted remote host and stamps it in the result', async () => {
    const local = createHost('host-local')
    const remote = createHost('host-remote')
    useHost(remote, true)
    const output = await update(upsert('r'), { host: 'runtime:env-1' })
    expect(remote.quickCommands().map((command) => command.id)).toEqual(['r'])
    expect(local.quickCommands()).toEqual([])
    expect(local.calls).toEqual([])
    expect(output._meta.runtimeId).toBe('host-remote')
    expect(output.result.host).toBe('runtime:env-1')
  })

  it('stores the same commands on a remote host, a local host and through desktop update', async () => {
    const mutations = [
      upsert('a'),
      upsert('b'),
      upsert('a', 'echo changed'),
      { type: 'delete', id: 'b' }
    ]
    const stored: unknown[] = []
    for (const remote of [false, true]) {
      const host = createHost(remote ? 'host-remote' : 'host-local')
      useHost(host, remote)
      for (const mutation of mutations) {
        await update(mutation, remote ? { host: 'runtime:env-1' } : {})
      }
      stored.push(host.quickCommands())
    }
    const viaDesktop = createHost('host-desktop')
    useHost(viaDesktop, false)
    await writeFile(
      join(directory, 'desktop.json'),
      JSON.stringify({
        terminalQuickCommands: [
          { id: 'a', label: 'Label a', command: 'echo changed', appendEnter: true }
        ]
      })
    )
    await invoke('settings desktop update', { file: 'desktop.json' })
    expect(stored[0]).toEqual(stored[1])
    expect(stored[0]).toEqual(viaDesktop.quickCommands())
  })

  it('rejects the command after the limit on every path and keeps the stored list', async () => {
    const full = Array.from({ length: MAX_QUICK_COMMANDS }, (_, index) => `c${index}`)
    for (const remote of [false, true]) {
      const host = createHost('host')
      useHost(host, remote)
      for (const id of full) {
        await update(upsert(id), remote ? { host: 'runtime:env-1' } : {})
      }
      await expect(
        update(upsert('over'), remote ? { host: 'runtime:env-1' } : {})
      ).rejects.toMatchObject({ message: expect.stringContaining('limit') })
      expect(host.quickCommands()).toHaveLength(MAX_QUICK_COMMANDS)
    }
    const viaDesktop = createHost('host-desktop')
    useHost(viaDesktop, false)
    await writeFile(
      join(directory, 'desktop.json'),
      JSON.stringify({
        terminalQuickCommands: [...full, 'over'].map((id) => ({
          id,
          label: id,
          command: id,
          appendEnter: true
        }))
      })
    )
    await expect(invoke('settings desktop update', { file: 'desktop.json' })).rejects.toThrow()
    expect(viaDesktop.quickCommands()).toEqual([])
  })

  it('rejects malformed input without echoing it or calling a host', async () => {
    const host = createHost('host-local')
    useHost(host, false)
    await expect(
      update({ type: 'upsert', command: { id: 'x', label: 'secret-canary' } })
    ).rejects.toMatchObject({
      code: 'invalid_argument',
      message: expect.not.stringContaining('canary')
    })
    expect(host.calls).toEqual([])
  })

  it('names SSH hosts as unsupported instead of writing somewhere else', async () => {
    const host = createHost('host-local')
    useHost(host, false)
    await expect(update(upsert('a'), { host: 'ssh:box' })).rejects.toMatchObject({
      code: 'invalid_argument',
      message: expect.stringContaining('ssh:box')
    })
    expect(host.calls).toEqual([])
  })

  it('refuses --host local while a paired runtime answers', async () => {
    const host = createHost('host-remote')
    useHost(host, true)
    await expect(update(upsert('a'), { host: 'local' })).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(host.calls).toEqual([])
  })

  it.each(['runtime_unavailable', 'runtime_timeout'])(
    'reports a lost connection (%s) as an unconfirmed write, never as success',
    async (code) => {
      vi.spyOn(RuntimeClient.prototype, 'isRemote', 'get').mockReturnValue(true)
      vi.spyOn(RuntimeClient.prototype, 'call').mockRejectedValue(
        new RuntimeClientError(code, 'No answer.')
      )
      const error = await update(upsert('a'), { host: 'runtime:env-1' }).catch(
        (caught: unknown) => caught
      )
      expect(error).toMatchObject({
        code,
        data: { host: 'runtime:env-1', writeConfirmed: false },
        message: expect.stringContaining('not confirmed')
      })
      expect(error).toMatchObject({
        message: expect.stringContaining('settings quick-commands list')
      })
      expect(error).toMatchObject({ message: expect.not.stringMatching(/exited|no process/i) })
    }
  )

  it('keeps a host refusal as the host answer, not an unconfirmed write', async () => {
    vi.spyOn(RuntimeClient.prototype, 'call').mockRejectedValue(
      new RuntimeRpcFailureError({
        id: 'req',
        ok: false,
        error: { code: 'forbidden', message: 'Refused.' },
        _meta: { runtimeId: 'host-remote' }
      })
    )
    const error = await update(upsert('a')).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'forbidden', message: 'Refused.' })
  })

  it('tells an older host to update when it lacks the method', async () => {
    vi.spyOn(RuntimeClient.prototype, 'call').mockRejectedValue(
      new RuntimeRpcFailureError({
        id: 'req',
        ok: false,
        error: { code: 'method_not_found', message: 'Unknown method' },
        _meta: { runtimeId: 'old' }
      })
    )
    await expect(update(upsert('a'))).rejects.toMatchObject({ code: 'update_required' })
  })
})

describe('settings quick-commands list', () => {
  it('lists ids, labels and actions of the selected host without command bodies', async () => {
    const host = createHost('host-remote')
    useHost(host, true)
    await update(upsert('a', 'secret-canary'), { host: 'runtime:env-1' })
    const output = await invoke(LIST, { host: 'runtime:env-1' })
    expect(host.calls.at(-1)).toBe('settings.getTerminalQuickCommands')
    expect(output.result).toMatchObject({
      host: 'runtime:env-1',
      commands: [{ id: 'a', label: 'Label a', action: 'terminal-command' }]
    })
    expect(JSON.stringify(output)).not.toContain('canary')
  })
})

describe('settings quick-commands host selection through the CLI entry point', () => {
  it.each([
    ['runtime:missing', 'Unknown Orca server'],
    ['ssh:box', 'cannot own quick commands']
  ])('fails %s with a named error and no host call', async (host, expected) => {
    vi.stubEnv('ORCA_USER_DATA_PATH', directory)
    vi.stubEnv('ORCA_ENVIRONMENT', '')
    vi.stubEnv('ORCA_PAIRING_CODE', '')
    await writeFile(join(directory, 'mutation.json'), JSON.stringify(upsert('a')))
    const call = vi
      .spyOn(RuntimeClient.prototype, 'call')
      .mockRejectedValue(new RuntimeClientError('runtime_unavailable', 'No runtime in this test.'))
    const output: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line) => void output.push(String(line)))
    vi.spyOn(console, 'error').mockImplementation((line) => void output.push(String(line)))
    const exitCode = process.exitCode
    try {
      await main(
        [
          'settings',
          'quick-commands',
          'update',
          '--file',
          'mutation.json',
          '--host',
          host,
          '--json'
        ],
        directory
      )
      expect(process.exitCode).toBe(1)
    } finally {
      process.exitCode = exitCode
    }
    expect(output.join('\n')).toContain(expected)
    expect(call).not.toHaveBeenCalledWith('settings.updateTerminalQuickCommands', expect.anything())
  })
})
