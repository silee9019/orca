import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { ACCOUNT_SECRET_SETTING_COMMAND_SPECS } from '../../src/cli/specs/account-secret-settings'
import { ACCOUNT_SECRET_SETTING_HANDLERS } from '../../src/cli/handlers/account-secret-settings'
import { ACCOUNT_SECRET_SETTING_METHODS } from '../../src/main/runtime/rpc/methods/account-secret-settings'
import {
  applyAccountSecretSetting,
  setAccountSecretSettingsWriter
} from '../../src/main/runtime/account-secret-settings-writer'
import type { RpcContext } from '../../src/main/runtime/rpc/core'

afterEach(() => {
  setAccountSecretSettingsWriter(null)
  vi.restoreAllMocks()
})

it.each(['agentDefaultEnv', 'httpProxyUrl', 'httpProxyBypassRules', 'opencodeSessionCookie'])(
  'accepts bounded private %s input but fails without the canonical writer and prints no secret',
  async (key) => {
    const root = mkdtempSync(join(tmpdir(), 'orca-secret-settings-fixture-'))
    try {
      const input = join(root, 'input')
      const secret = 'fixture-sensitive-setting'
      const value =
        key === 'agentDefaultEnv'
          ? JSON.stringify({ claude: { FIXTURE_TOKEN: secret } })
          : key === 'httpProxyUrl'
            ? `http://fixture:${secret}@proxy.example.invalid:8080`
            : secret
      writeFileSync(input, value, { mode: 0o600 })
      const specs = ACCOUNT_SECRET_SETTING_COMMAND_SPECS
      const parsed = parseArgs(
        ['secrets', 'set', '--key', key, '--input-file', input, '--json'],
        specs.flatMap(specPaths),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      const client = new RuntimeClient(root, 100, null, null, 'orca')
      const method = ACCOUNT_SECRET_SETTING_METHODS[0]
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this deliberately unavailable RPC reads only clientKind and cannot access runtime services or persistent state.
      const context = {} as RpcContext
      const call = vi
        .spyOn(client, 'call')
        .mockImplementation(async (_, params) =>
          method.handler(method.params.parse(params), context)
        )
      const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      await expect(
        ACCOUNT_SECRET_SETTING_HANDLERS['secrets set']({
          client,
          cwd: root,
          flags: parsed.flags,
          json: true
        })
      ).rejects.toThrow('canonical settings writer')
      expect(call).toHaveBeenCalledWith('accountSecretSettings.apply', {
        action: 'set',
        key,
        input: value
      })
      expect(output).not.toHaveBeenCalled()
      expect(output.mock.calls.flat().join(' ')).not.toContain(secret)
      const settingsPath = join(root, 'canonical-writer-fixture.json')
      const writer = vi.fn(async (patch) => {
        writeFileSync(settingsPath, JSON.stringify(patch), { mode: 0o600 })
        return { rawSecret: secret }
      })
      setAccountSecretSettingsWriter(writer)
      await ACCOUNT_SECRET_SETTING_HANDLERS['secrets set']({
        client,
        cwd: root,
        flags: parsed.flags,
        json: true
      })
      const expected = key === 'agentDefaultEnv' ? { claude: { FIXTURE_TOKEN: secret } } : value
      expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({ [key]: expected })
      expect(writer).toHaveBeenCalledTimes(1)
      expect(output.mock.calls.flat().join(' ')).not.toContain(secret)
      expect(output.mock.calls.flat().join(' ')).toContain('updated')
      await ACCOUNT_SECRET_SETTING_HANDLERS['secrets clear']({
        client,
        cwd: root,
        flags: parsed.flags,
        json: true
      })
      expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
        [key]: key === 'agentDefaultEnv' ? {} : ''
      })
      expect(() =>
        method.handler(method.params.parse({ action: 'clear', key }), {
          ...context,
          clientKind: 'runtime'
        })
      ).toThrow('only available')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)

it('validates sensitive input before calling the canonical writer and hides writer errors', async () => {
  const writer = vi.fn(async () => {
    throw new Error('fixture-private-writer-value')
  })
  setAccountSecretSettingsWriter(writer)
  await expect(
    applyAccountSecretSetting({ action: 'set', key: 'agentDefaultEnv', input: '{bad-private-json' })
  ).rejects.toThrow('JSON object')
  await expect(
    applyAccountSecretSetting({
      action: 'set',
      key: 'httpProxyUrl',
      input: 'ftp://private-value@example.invalid'
    })
  ).rejects.toThrow('proxy URL')
  expect(writer).not.toHaveBeenCalled()
  await expect(
    applyAccountSecretSetting({
      action: 'set',
      key: 'opencodeSessionCookie',
      input: 'fixture-cookie'
    })
  ).rejects.toThrow('could not apply')
  await expect(
    applyAccountSecretSetting({
      action: 'set',
      key: 'httpProxyBypassRules',
      input: 'é'.repeat(65536)
    })
  ).rejects.toThrow('65536 bytes')
  expect(writer).toHaveBeenCalledTimes(1)
})
