import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { AGENT_PERMISSION_MODE_COMMAND_SPECS } from '../../src/cli/specs/agent-permission-mode'
import { AGENT_PERMISSION_MODE_HANDLERS } from '../../src/cli/handlers/agent-permission-mode'
import { AGENT_PERMISSION_MODE_METHODS } from '../../src/main/runtime/rpc/methods/agent-permission-mode'
import { setAgentPermissionModeAccess } from '../../src/main/runtime/agent-permission-mode-access'
import type { RpcContext } from '../../src/main/runtime/rpc/core'

afterEach(() => {
  setAgentPermissionModeAccess(null)
  vi.restoreAllMocks()
})

it('persists agent launch permission defaults through the injected canonical writer and preserves private custom overrides', async () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-agent-mode-fixture-'))
  try {
    const settingsPath = join(root, 'settings')
    const secret = 'fixture-private-agent-override'
    const initial = {
      agentDefaultArgs: { claude: `--model ${secret}` },
      agentDefaultEnv: { goose: { CUSTOM_TOKEN: secret } }
    }
    writeFileSync(settingsPath, JSON.stringify(initial), { mode: 0o600 })
    const read = () => JSON.parse(readFileSync(settingsPath, 'utf8'))
    const write = vi.fn(async (patch) => {
      writeFileSync(settingsPath, JSON.stringify(patch), { mode: 0o600 })
      return { secret }
    })
    const client = new RuntimeClient(root, 100, null, null, 'orca')
    const method = AGENT_PERMISSION_MODE_METHODS[0]
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this standalone RPC reads only clientKind and the explicitly configured fixture callbacks.
    const context = {} as RpcContext
    vi.spyOn(client, 'call').mockImplementation(async (_, params) => ({
      id: 'fixture',
      ok: true,
      result: await method.handler(method.params.parse(params), context),
      _meta: { runtimeId: 'fixture' }
    }))
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const run = async (action: string, mode?: string) => {
      const specs = AGENT_PERMISSION_MODE_COMMAND_SPECS
      const parsed = parseArgs(
        ['agent-permissions', action, '--json', ...(mode ? ['--mode', mode] : [])],
        specs.flatMap(specPaths),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      await AGENT_PERMISSION_MODE_HANDLERS[parsed.commandPath.join(' ')]({
        client,
        cwd: root,
        flags: parsed.flags,
        json: true
      })
    }
    await expect(run('set', 'yolo')).rejects.toThrow('canonical settings reader and writer')
    expect(read()).toEqual(initial)
    setAgentPermissionModeAccess({ read, write })
    await run('set', 'yolo')
    expect(read().agentDefaultArgs.codex).toBe('--dangerously-bypass-approvals-and-sandbox')
    await run('set', 'manual')
    expect(read().agentDefaultArgs.codex).toBe('')
    expect(read().agentDefaultArgs.claude).toBe(initial.agentDefaultArgs.claude)
    expect(read().agentDefaultEnv.goose).toEqual(initial.agentDefaultEnv.goose)
    await run('status')
    expect(write).toHaveBeenCalledTimes(2)
    expect(output.mock.calls.flat().join(' ')).toContain('mixed')
    expect(output.mock.calls.flat().join(' ')).not.toContain(secret)
    expect(method.params.safeParse({ action: 'set', mode: 'mixed' }).success).toBe(false)
    expect(() =>
      method.handler({ action: 'status' }, { ...context, clientKind: 'runtime' })
    ).toThrow('only available')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
