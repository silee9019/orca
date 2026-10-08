import * as usageScanners from '../../src/main/usage/usage-scan-worker-spawn'
import { codexUsageProvider } from '../../src/main/codex-usage/codex-usage-provider'
import { openCodeUsageProvider } from '../../src/main/opencode-usage/opencode-usage-provider'
import { museUsageProvider } from '../../src/main/muse-usage/muse-usage-provider'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { USAGE_COMMAND_SPECS, RATE_LIMIT_COMMAND_SPECS } from '../../src/cli/specs/usage'
import { USAGE_HANDLERS } from '../../src/cli/handlers/usage'
import { RATE_LIMIT_HANDLERS } from '../../src/cli/handlers/rate-limits'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { buildRegistry, isStreamingMethod } from '../../src/main/runtime/rpc/core'
import { USAGE_METHODS } from '../../src/main/runtime/rpc/methods/usage'
import { ACCOUNT_METHODS } from '../../src/main/runtime/rpc/methods/accounts'
import { RATE_LIMIT_METHODS } from '../../src/main/runtime/rpc/methods/rate-limits'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { ClaudeUsageStore, initClaudeUsagePath } from '../../src/main/claude-usage/store'
import { CodexUsageStore, initCodexUsagePath } from '../../src/main/codex-usage/store'
import { OpenCodeUsageStore, initOpenCodeUsagePath } from '../../src/main/opencode-usage/store'
import { MuseUsageStore, initMuseUsagePath } from '../../src/main/muse-usage/store'
import type { RateLimitState } from '../../src/shared/rate-limit-types'
import type { RuntimeRateLimitService } from '../../src/main/runtime/runtime-rate-limit-controller'

const fixtureState = vi.hoisted(() => ({ directory: '' }))
const fixtureIpc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }))
export const ipcFixture = fixtureIpc
vi.mock('electron', () => ({
  app: { getPath: () => fixtureState.directory },
  BrowserWindow: { fromId: () => null },
  webContents: { fromId: () => null },
  ipcMain: fixtureIpc
}))

export const fixture = fixtureState
fixture.directory = mkdtempSync(join(tmpdir(), 'orca-usage-cli-'))
afterAll(() => rmSync(fixture.directory, { recursive: true, force: true }))
afterEach(() => vi.restoreAllMocks())

function rateFixture() {
  const state: RateLimitState = {
    claude: null,
    codex: null,
    gemini: null,
    opencodeGo: null,
    kimi: null,
    antigravity: null,
    minimax: null,
    grok: null,
    cursor: null,
    zcode: null,
    minimaxCookieConfigured: false,
    minimaxApiKeyConfigured: false,
    opencodeGoApiKeyConfigured: false,
    grokAuthConfigured: false,
    cursorAuthConfigured: false,
    claudeTarget: { runtime: 'host', wslDistro: null },
    codexTarget: { runtime: 'host', wslDistro: null },
    inactiveClaudeAccounts: [],
    inactiveCodexAccounts: []
  }
  const service = {
    getState: vi.fn(() => state),
    refresh: vi.fn(async () => state),
    refreshClaudeForTarget: vi.fn<RuntimeRateLimitService['refreshClaudeForTarget']>(
      async (target) => ({ ...state, claudeTarget: target })
    ),
    refreshCodexForTarget: vi.fn<RuntimeRateLimitService['refreshCodexForTarget']>(
      async (target) => ({ ...state, codexTarget: target })
    ),
    setPollingInterval: vi.fn(),
    fetchInactiveClaudeAccountsOnOpen: vi.fn(async () => {}),
    fetchInactiveCodexAccountsOnOpen: vi.fn(async () => {}),
    refreshGrok: vi.fn(async () => state),
    onStateChange: vi.fn<RuntimeRateLimitService['onStateChange']>(() => () => {})
  } satisfies RuntimeRateLimitService
  return service
}

export function setup() {
  vi.spyOn(usageScanners, 'scanClaudeUsageFilesViaWorker').mockResolvedValue({
    processedFiles: [],
    sessions: [],
    dailyAggregates: []
  })
  vi.spyOn(codexUsageProvider, 'scan').mockResolvedValue({
    processedFiles: [],
    sessions: [],
    dailyAggregates: []
  })
  vi.spyOn(openCodeUsageProvider, 'scan').mockResolvedValue({
    processedDatabases: [],
    sessions: [],
    dailyAggregates: []
  })
  vi.spyOn(museUsageProvider, 'scan').mockResolvedValue({
    processedFiles: [],
    sessions: [],
    dailyAggregates: []
  })
  initClaudeUsagePath()
  initCodexUsagePath()
  initOpenCodeUsagePath()
  initMuseUsagePath()
  const store = { getRepos: () => [], getAllWorktreeMeta: () => ({}) }
  const providers = {
    claude: new ClaudeUsageStore(store),
    codex: new CodexUsageStore(store),
    opencode: new OpenCodeUsageStore(store),
    muse: new MuseUsageStore(store)
  }
  const rates = rateFixture()
  const runtime = new OrcaRuntimeService()
  runtime.setUsageServices(providers, rates)
  const client = new RuntimeClient(fixture.directory, 1000, null, null)
  const registry = buildRegistry([...USAGE_METHODS, ...RATE_LIMIT_METHODS, ...ACCOUNT_METHODS])
  vi.spyOn(client, 'call').mockImplementation(async (name, params) => {
    const method = registry.get(name)
    if (!method || isStreamingMethod(method)) {
      throw new Error(`method_not_found:${name}`)
    }
    const result = await method.handler(method.params ? method.params.parse(params) : undefined, {
      runtime
    })
    return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture-host' } }
  })
  return { client, providers, rates, runtime, registry }
}

export async function command(client: RuntimeClient, argv: string[]) {
  const specs = [...USAGE_COMMAND_SPECS, ...RATE_LIMIT_COMMAND_SPECS]
  const parsed = parseArgs(
    argv,
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  const handler = { ...USAGE_HANDLERS, ...RATE_LIMIT_HANDLERS }[parsed.commandPath.join(' ')]
  if (!handler) {
    throw new Error('missing_handler')
  }
  await handler({ client, flags: parsed.flags, cwd: fixture.directory, json: true })
}
