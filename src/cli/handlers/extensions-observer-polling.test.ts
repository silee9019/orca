import { afterEach, expect, it, vi } from 'vitest'
import { AUTOMATION_HANDLERS } from './automations'
import { MANAGED_PROFILE_HANDLERS } from './profiles-managed'
import { MANAGED_SKILL_HANDLERS } from './skills-managed'
import { PLUGIN_HANDLERS } from './plugins'
import { SPARSE_PRESET_HANDLERS } from './sparse-presets'
import type { CommandHandler } from '../dispatch'
import { RuntimeClient } from '../runtime-client'

afterEach(() => vi.restoreAllMocks())

const CASES: {
  command: string
  handlers: Record<string, CommandHandler>
  method: string
  params?: unknown
  flags?: [string, string][]
}[] = [
  {
    command: 'automations list',
    handlers: AUTOMATION_HANDLERS,
    method: 'automation.list'
  },
  {
    command: 'profile auth-status',
    handlers: MANAGED_PROFILE_HANDLERS,
    method: 'profile.authStatus'
  },
  { command: 'plugins list', handlers: PLUGIN_HANDLERS, method: 'plugins.list' },
  {
    command: 'skills install-progress',
    handlers: MANAGED_SKILL_HANDLERS,
    method: 'skills.getInstallProgress',
    params: { operationId: 'op-1' },
    flags: [['operation', 'op-1']]
  },
  {
    command: 'sparse-presets list',
    handlers: SPARSE_PRESET_HANDLERS,
    method: 'repo.sparsePresets',
    params: { repo: 'repo-1' },
    flags: [['repo', 'repo-1']]
  }
]

it.each(CASES)(
  '$command reads the host again on every call so a change notification needs no CLI cache',
  async ({ command, handlers, method, params, flags }) => {
    const client = new RuntimeClient('/unused-observer-fixture')
    const call = vi.spyOn(client, 'call')
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = handlers[command]
    if (!handler) {
      throw new Error(`missing ${command}`)
    }
    for (const state of ['before-change', 'after-change']) {
      call.mockResolvedValueOnce({
        id: 'fixture',
        ok: true,
        result: { state },
        _meta: { runtimeId: 'fixture' }
      })
      await handler({ flags: new Map(flags), client, cwd: '/folder', json: true })
    }
    expect(call).toHaveBeenCalledTimes(2)
    for (const entry of call.mock.calls) {
      expect(entry[0]).toBe(method)
      expect(entry[1]).toEqual(params)
    }
    expect(String(output.mock.calls[0]?.[0])).toContain('before-change')
    expect(String(output.mock.calls[1]?.[0])).toContain('after-change')
    expect(String(output.mock.calls[1]?.[0])).not.toContain('before-change')
  }
)
