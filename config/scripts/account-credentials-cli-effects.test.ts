import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as NodeOs from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { ACCOUNT_CREDENTIAL_COMMAND_SPECS } from '../../src/cli/specs/account-credentials'
import { ACCOUNT_CREDENTIAL_HANDLERS } from '../../src/cli/handlers/account-credentials'
import type { RpcContext } from '../../src/main/runtime/rpc/core'
import {
  RuntimeAccountController,
  type RuntimeAccountServices
} from '../../src/main/runtime/runtime-account-controller'
import { ACCOUNT_CREDENTIAL_METHODS } from '../../src/main/runtime/rpc/methods/account-credentials'

import { getSecretStore, setSecretStore, type SecretStore } from '../../src/shared/secret-store'
let previousSecretStore: SecretStore | undefined

const fixture = vi.hoisted(() => ({
  home: '',
  verifyBitbucket: vi.fn(async () => ({ ok: true, user: {} }))
}))
vi.mock('node:os', async (original) => ({
  ...(await original<typeof NodeOs>()),
  homedir: () => fixture.home
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value.split('').toReversed().join('')),
    decryptString: (value: Buffer) => value.toString().split('').toReversed().join('')
  }
}))
vi.mock('../../src/main/rate-limits/minimax/minimax-request-context', () => ({
  clearMiniMaxSessionCookieJar: vi.fn(async () => undefined)
}))
vi.mock('../../src/main/rate-limits/zcode-usage-fetcher', () => ({
  hasZcodeCliPlanCredentials: () => false
}))

vi.mock('../../src/main/bitbucket/user-request', () => ({
  fetchBitbucketUserResult: fixture.verifyBitbucket,
  accountNameFromUser: () => 'fixture-bitbucket'
}))

beforeEach(() => {
  try {
    previousSecretStore = getSecretStore()
  } catch {
    previousSecretStore = undefined
  }
  setSecretStore({
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value.split('').toReversed().join('')),
    decryptString: (value) => value.toString().split('').toReversed().join(''),
    describeProtectionGap: () => null
  })
  fixture.home = mkdtempSync(join(tmpdir(), 'orca-credentials-rpc-fixture-'))
})
afterEach(() => {
  if (previousSecretStore) {
    setSecretStore(previousSecretStore)
  }
  vi.restoreAllMocks()
  rmSync(fixture.home, { recursive: true, force: true })
})

it.each([
  ['opencode-go', 'opencode-go-api-key.enc'],
  ['minimax-api-key', 'minimax-api-key.enc'],
  ['minimax-cookie', 'minimax-session-cookie.enc'],
  ['zcode-plan', 'zcode-plan-api-key.enc'],
  ['bitbucket', 'bitbucket-credential.enc']
])(
  'runs public credential argv through parser, handler, RPC and the existing %s file store',
  async (provider, fileName) => {
    const controller = new RuntimeAccountController()
    const refresh = vi.fn(async () => undefined)
    const invalidate = vi.fn()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: credential operations reach only these rate-limit callbacks; omitted account services are never invoked by this scenario.
    controller.setServices({
      rateLimits: {
        refresh,
        invalidateMiniMaxCredentialState: invalidate,
        invalidateOpenCodeGoCredentialState: invalidate,
        invalidateZcodeCredentialState: invalidate
      }
    } as unknown as RuntimeAccountServices)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these three RPC handlers use only manageAccountCredential; an unexpected runtime call fails immediately.
    const context = {
      runtime: { manageAccountCredential: controller.manageCredential.bind(controller) }
    } as unknown as RpcContext
    const client = new RuntimeClient(join(fixture.home, 'profile'), 100, null, null, 'orca')
    const [status, save, clear] = ACCOUNT_CREDENTIAL_METHODS
    vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
      const result =
        method === save.name
          ? await save.handler(save.params.parse(params), context)
          : method === clear.name
            ? await clear.handler(clear.params.parse(params), context)
            : await status.handler(status.params.parse(params), context)
      return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const inputPath = join(fixture.home, 'credential-input')
    const secret = 'fixture-secret-not-for-output'
    writeFileSync(
      inputPath,
      provider === 'bitbucket'
        ? JSON.stringify({ authMode: 'token', accessToken: secret })
        : secret,
      { mode: 0o600 }
    )
    for (const action of ['save', 'status', 'clear']) {
      const argv = [
        'credentials',
        action,
        '--provider',
        provider,
        '--json',
        ...(action === 'save' ? ['--input-file', inputPath] : [])
      ]
      const parsed = parseArgs(
        argv,
        ACCOUNT_CREDENTIAL_COMMAND_SPECS.flatMap(specPaths),
        ACCOUNT_CREDENTIAL_COMMAND_SPECS
      )
      validateCommandAndFlags(ACCOUNT_CREDENTIAL_COMMAND_SPECS, parsed)
      await ACCOUNT_CREDENTIAL_HANDLERS[parsed.commandPath.join(' ')]({
        client,
        cwd: fixture.home,
        flags: parsed.flags,
        json: true
      })
      const storedPath = join(fixture.home, '.orca', fileName)
      if (action !== 'clear') {
        expect(existsSync(storedPath)).toBe(true)
        expect(readFileSync(storedPath, 'utf8')).not.toContain(secret)
        if (process.platform !== 'win32') {
          expect(statSync(storedPath).mode & 0o777).toBe(0o600)
        }
      } else {
        expect(existsSync(storedPath)).toBe(false)
      }
    }
    expect(invalidate).toHaveBeenCalledTimes(provider === 'bitbucket' ? 0 : 2)
    expect(refresh).toHaveBeenCalledTimes(provider === 'bitbucket' ? 0 : 2)
    if (provider === 'bitbucket') {
      expect(fixture.verifyBitbucket).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: secret }),
        6000
      )
    }
    expect(output.mock.calls.flat().join(' ')).not.toContain(secret)
    expect(output.mock.calls.flat().join(' ')).toContain('true')
    expect(() =>
      save.handler({ provider: 'opencode-go', secret }, { ...context, clientKind: 'runtime' })
    ).toThrow('only available')
  }
)
