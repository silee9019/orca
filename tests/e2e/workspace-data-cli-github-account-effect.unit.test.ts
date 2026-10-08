import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_GITHUB_ACCOUNT_HANDLERS } from '../../src/cli/handlers/workspace-github-account'
import * as provider from '../../src/main/github/client'
import { diagnoseGhAuth } from '../../src/main/github/auth-diagnose'
import { track } from '../../src/main/telemetry/client'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { WORKSPACE_GITHUB_ACCOUNT_METHODS } from '../../src/main/runtime/rpc/methods/workspace-github-account'

vi.mock('../../src/main/github/client', async (original) => ({
  ...(await original<typeof provider>()),
  getAuthenticatedViewer: vi.fn().mockResolvedValue({ login: 'host-account', email: null }),
  checkOrcaStarred: vi.fn(),
  starOrca: vi.fn()
}))
vi.mock('../../src/main/github/auth-diagnose', () => ({
  diagnoseGhAuth: vi.fn().mockResolvedValue({ ghAvailable: false })
}))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/telemetry/cohort-classifier', () => ({
  getCohortAtEmit: () => ({ nth_repo_added: 3 })
}))

let directory: string
let input: string
let output: string
let ctx: HandlerContext
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-github-account-'))
  input = join(directory, 'input.json')
  output = join(directory, 'host-star.json')
  vi.mocked(provider.starOrca).mockImplementation(async () => {
    await writeFile(output, JSON.stringify({ repository: 'stablyai/orca' }))
    return true
  })
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: WORKSPACE_GITHUB_ACCOUNT_METHODS
  })
  const client = new RuntimeClient(join(directory, 'client-home'))
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  ctx = { client, cwd: directory, json: true, flags: new Map([['params-file', input]]) }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('retains runtime account, diagnostic host and true/false/null star-check results', async () => {
  await writeFile(input, '{}')
  await WORKSPACE_GITHUB_ACCOUNT_HANDLERS['github viewer'](ctx)
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('host-account'))
  await writeFile(input, JSON.stringify({ host: 'ghe.example.invalid' }))
  await WORKSPACE_GITHUB_ACCOUNT_HANDLERS['github diagnose-auth'](ctx)
  expect(diagnoseGhAuth).toHaveBeenCalledWith('ghe.example.invalid')
  await writeFile(input, '{}')
  for (const result of [true, false, null]) {
    vi.mocked(provider.checkOrcaStarred).mockResolvedValue(result)
    await WORKSPACE_GITHUB_ACCOUNT_HANDLERS['github check-orca-starred'](ctx)
    expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining(`"result": ${result}`))
  }
  expect(provider.starOrca).not.toHaveBeenCalled()
})

it('checks source and exact confirmation before the existing star and telemetry effects', async () => {
  await writeFile(input, JSON.stringify({ source: 'settings' }))
  await expect(WORKSPACE_GITHUB_ACCOUNT_HANDLERS['github star-orca'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  ctx.flags.set('confirm', 'wrong')
  await expect(WORKSPACE_GITHUB_ACCOUNT_HANDLERS['github star-orca'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  ctx.flags.set('confirm', 'stablyai/orca')
  await writeFile(input, JSON.stringify({ source: 'unknown' }))
  await expect(WORKSPACE_GITHUB_ACCOUNT_HANDLERS['github star-orca'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(input, JSON.stringify({ source: 'settings' }))
  await WORKSPACE_GITHUB_ACCOUNT_HANDLERS['github star-orca'](ctx)
  expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({ repository: 'stablyai/orca' })
  expect(provider.starOrca).toHaveBeenCalledExactlyOnceWith()
  expect(track).toHaveBeenCalledExactlyOnceWith('app_starred_orca', {
    source: 'settings',
    nth_repo_added: 3
  })
  vi.mocked(provider.starOrca).mockResolvedValue(false)
  await expect(WORKSPACE_GITHUB_ACCOUNT_HANDLERS['github star-orca'](ctx)).rejects.toMatchObject({
    code: 'operation_failed'
  })
  expect(track).toHaveBeenCalledTimes(1)
})

it('fails on an old peer without retrying or touching the provider', async () => {
  await writeFile(input, '{}')
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old peer')
  )
  await expect(WORKSPACE_GITHUB_ACCOUNT_HANDLERS['github viewer'](ctx)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(ctx.client.call).toHaveBeenCalledTimes(1)
  expect(provider.getAuthenticatedViewer).not.toHaveBeenCalled()
  expect(provider.starOrca).not.toHaveBeenCalled()
})
