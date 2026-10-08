import '../unused-default-rpc-methods.test-fixture'
import { beforeEach, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { WORKSPACE_BITBUCKET_METHODS } from './workspace-bitbucket'

const fixture = vi.hoisted(() => ({ configured: false, reject: false, reset: vi.fn() }))
vi.mock('../../../bitbucket/credential-connection', () => ({
  connectBitbucket: vi.fn(async () => {
    if (fixture.reject) {
      throw new Error('canary-token')
    }
    fixture.configured = true
    return { ok: true, account: 'fixture', accessToken: 'canary-token' }
  }),
  disconnectBitbucket: vi.fn(() => {
    fixture.configured = false
  }),
  getBitbucketConnectionStatus: () => ({
    configured: fixture.configured,
    source: fixture.configured ? 'stored' : 'none',
    account: 'fixture',
    authMode: 'token',
    email: null,
    baseUrl: 'https://user:canary-token@example.invalid/private?token=canary-token'
  })
}))
vi.mock('../../../preflight/agent-detection', () => ({ _resetPreflightCache: fixture.reset }))
beforeEach(() => {
  fixture.configured = false
  fixture.reject = false
  fixture.reset.mockClear()
})

it('dispatches validated credentials, reads safe metadata and removes the stored fixture connection', async () => {
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: WORKSPACE_BITBUCKET_METHODS
  })
  const request = (method: string, params?: unknown) =>
    dispatcher.dispatch({ id: 'fixture', authToken: 'fixture', method, params })
  const invalid = await request('bitbucket.connect', { authMode: 'token' })
  expect(invalid.ok).toBe(false)
  expect(fixture.configured).toBe(false)
  const connected = await request('bitbucket.connect', {
    authMode: 'token',
    accessToken: 'canary-token'
  })
  expect(connected).toMatchObject({ ok: true, result: { ok: true } })
  expect(JSON.stringify(connected)).not.toContain('canary-token')
  expect(await request('bitbucket.status')).toMatchObject({
    result: { configured: true, baseUrl: 'https://example.invalid' }
  })
  expect(await request('bitbucket.disconnect')).toMatchObject({ result: { ok: true } })
  expect(await request('bitbucket.status')).toMatchObject({ result: { configured: false } })
  expect(fixture.reset).toHaveBeenCalledTimes(2)
})

it('sanitizes provider exceptions before they enter the RPC response', async () => {
  fixture.reject = true
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: WORKSPACE_BITBUCKET_METHODS
  })
  const response = await dispatcher.dispatch({
    id: 'fixture',
    authToken: 'fixture',
    method: 'bitbucket.connect',
    params: { authMode: 'token', accessToken: 'canary-token' }
  })
  expect(response.ok).toBe(false)
  expect(JSON.stringify(response)).not.toContain('canary-token')
  expect(fixture.reset).not.toHaveBeenCalled()
})
