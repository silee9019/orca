import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { ACCOUNT_CREDENTIAL_HANDLERS } from './account-credentials'

afterEach(() => vi.restoreAllMocks())

it('rejects an oversized credential before contacting the runtime', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orca-large-credential-fixture-'))
  try {
    const input = join(dir, 'input')
    writeFileSync(input, Buffer.alloc(65537, 65), { mode: 0o600 })
    const client = new RuntimeClient('/unused-fixture', 100, null, null, 'orca')
    const call = vi.spyOn(client, 'call')
    await expect(
      ACCOUNT_CREDENTIAL_HANDLERS['credentials save']({
        client,
        cwd: dir,
        flags: new Map([
          ['provider', 'opencode-go'],
          ['input-file', input]
        ]),
        json: true
      })
    ).rejects.toThrow('at most 65536')
    expect(call).not.toHaveBeenCalled()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('reads the credential from a private input file and prints only status after save and clear', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orca-credential-fixture-'))
  try {
    const input = join(dir, 'input')
    writeFileSync(input, 'fixture-secret-value\n', { mode: 0o600 })
    const client = new RuntimeClient('/unused-fixture', 100, null, null, 'orca')
    let stored = ''
    const call = vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
      if (
        method === 'accountCredentials.save' &&
        typeof params === 'object' &&
        params &&
        'secret' in params &&
        typeof params.secret === 'string'
      ) {
        stored = params.secret
      }
      if (method === 'accountCredentials.clear') {
        stored = ''
      }
      return {
        id: 'fixture',
        ok: true,
        result: { apiKeyConfigured: stored !== '' },
        _meta: { runtimeId: 'fixture' }
      }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const ctx = {
      client,
      cwd: dir,
      flags: new Map([
        ['provider', 'opencode-go'],
        ['input-file', input]
      ]),
      json: true
    }
    await ACCOUNT_CREDENTIAL_HANDLERS['credentials save'](ctx)
    expect(stored).toBe('fixture-secret-value')
    expect(log.mock.calls.flat().join(' ')).not.toContain(stored)
    await ACCOUNT_CREDENTIAL_HANDLERS['credentials status'](ctx)
    expect(call).toHaveBeenLastCalledWith('accountCredentials.status', { provider: 'opencode-go' })
    await ACCOUNT_CREDENTIAL_HANDLERS['credentials clear'](ctx)
    expect(stored).toBe('')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
