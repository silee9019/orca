import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { ACCOUNT_HANDLERS } from './account'

afterEach(() => vi.restoreAllMocks())

describe('managed Claude and Codex account controls', () => {
  it.each(['claude', 'codex'])(
    'selects and removes the requested %s account through the existing RPC',
    async (agent) => {
      const client = new RuntimeClient('/unused-fixture', 100, null, null, 'orca')
      let selected: string | null = null
      const accounts = [{ id: 'fixture-account', email: 'fixture@example.invalid' }]
      const call = vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
        const accountId =
          typeof params === 'object' && params !== null && 'accountId' in params
            ? params.accountId
            : undefined
        if (method.startsWith('accounts.select')) {
          selected = typeof accountId === 'string' ? accountId : null
        }
        if (method.startsWith('accounts.remove')) {
          accounts.splice(0)
        }
        return {
          id: 'fixture',
          ok: true,
          _meta: { runtimeId: 'fixture' },
          result: { accounts: [...accounts], activeAccountId: selected }
        }
      })
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      const ctx = {
        client,
        cwd: '/fixture',
        flags: new Map([
          ['agent', agent],
          ['account', 'fixture-account']
        ]),
        json: true
      }
      await ACCOUNT_HANDLERS['account select'](ctx)
      expect(selected).toBe('fixture-account')
      expect(call).toHaveBeenLastCalledWith(
        `accounts.select${agent === 'claude' ? 'Claude' : 'Codex'}`,
        { accountId: 'fixture-account' }
      )
      ctx.flags.set('account', 'system')
      await ACCOUNT_HANDLERS['account select'](ctx)
      expect(selected).toBeNull()
      ctx.flags.set('account', 'fixture-account')
      await expect(ACCOUNT_HANDLERS['account rm'](ctx)).rejects.toThrow('--confirm true')
      expect(accounts).toHaveLength(1)
      ctx.flags.set('confirm', 'true')
      await ACCOUNT_HANDLERS['account rm'](ctx)
      expect(accounts).toEqual([])
    }
  )

  it('rejects removing system credentials before calling the runtime', async () => {
    const client = new RuntimeClient('/unused-fixture', 100, null, null, 'orca')
    const call = vi.spyOn(client, 'call')
    await expect(
      ACCOUNT_HANDLERS['account rm']({
        client,
        cwd: '/fixture',
        flags: new Map([
          ['agent', 'claude'],
          ['account', 'system']
        ]),
        json: true
      })
    ).rejects.toThrow('System credentials')
    expect(call).not.toHaveBeenCalled()
  })
})
