import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { isStreamingMethod } from '../../src/main/runtime/rpc/core'
import { fixture, setup, command } from './usage-cli-test-fixture'

describe('usage CLI parser → handler → RPC → existing stores', () => {
  it.each(['claude', 'codex', 'opencode', 'muse'])(
    'persists %s scanning state and reads each query from the answering host',
    async (provider) => {
      const { client, providers } = setup()
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      await command(client, ['usage', 'set-enabled', '--provider', provider, '--enabled', 'true'])
      const cache = JSON.parse(
        readFileSync(join(fixture.directory, `orca-${provider}-usage.json`), 'utf8')
      )
      expect(cache.scanState.enabled).toBe(true)
      await command(client, ['usage', 'scan-state', '--provider', provider])
      expect(String(log.mock.calls.at(-1)?.[0])).toContain('"enabled": true')
      for (const leaf of ['snapshot', 'summary', 'daily', 'sessions']) {
        await command(client, [
          'usage',
          leaf,
          '--provider',
          provider,
          '--scope',
          'all',
          '--range',
          '7d'
        ])
      }
      await command(client, ['usage', 'breakdown', '--provider', provider, '--kind', 'project'])
      await command(client, ['usage', 'refresh', '--provider', provider, '--force'])
      expect(
        JSON.parse(readFileSync(join(fixture.directory, `orca-${provider}-usage.json`), 'utf8'))
          .scanState.lastScanCompletedAt
      ).toEqual(expect.any(Number))
      await command(client, ['usage', 'set-enabled', '--provider', provider, '--enabled', 'false'])
      expect(log.mock.calls.length).toBe(9)
      expect(String(log.mock.calls[3][0])).toContain('"range": "7d"')
      expect(String(log.mock.calls[3][0])).toContain('"scope": "all"')
      for (const store of Object.values(providers)) {
        await store.flush()
      }
    }
  )

  it('rejects malformed provider, filter and boolean inputs before contacting any host', async () => {
    const { client } = setup()
    const call = vi.spyOn(client, 'call')
    for (const argv of [
      ...['browser', 'page', 'server'].flatMap((flag) => [
        ['usage', 'summary', '--provider', 'claude', `--${flag}`, 'fixture'],
        ['rate-limit', 'get', `--${flag}`, 'fixture']
      ]),
      ['usage', 'summary', '--provider', 'invalid'],
      ['usage', 'summary', '--provider', 'claude', '--range', 'yesterday'],
      ['usage', 'set-enabled', '--provider', 'codex', '--enabled', 'yes'],
      ['rate-limit', 'refresh-target', '--provider', 'codex', '--runtime', 'wsl'],
      [
        'rate-limit',
        'refresh-target',
        '--provider',
        'codex',
        '--runtime',
        'host',
        '--wsl-distro',
        'Ubuntu'
      ]
    ]) {
      await expect(command(client, argv)).rejects.toMatchObject({ code: 'invalid_argument' })
    }
    expect(call).not.toHaveBeenCalled()
  })

  it('routes rate-limit updates to the exact target and provider services', async () => {
    const { client, rates } = setup()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await command(client, [
      'rate-limit',
      'refresh-target',
      '--provider',
      'codex',
      '--runtime',
      'wsl',
      '--wsl-distro',
      'Ubuntu'
    ])
    expect(rates.refreshCodexForTarget).toHaveBeenCalledExactlyOnceWith({
      runtime: 'wsl',
      wslDistro: 'Ubuntu'
    })
    await command(client, [
      'rate-limit',
      'refresh-target',
      '--provider',
      'claude',
      '--runtime',
      'host'
    ])
    expect(rates.refreshClaudeForTarget).toHaveBeenCalledExactlyOnceWith({
      runtime: 'host',
      wslDistro: null
    })
    await command(client, ['rate-limit', 'set-polling-interval', '--ms', '60000'])
    expect(rates.setPollingInterval).toHaveBeenCalledExactlyOnceWith(60000)
    await command(client, ['rate-limit', 'fetch-inactive', '--provider', 'claude'])
    await command(client, ['rate-limit', 'fetch-inactive', '--provider', 'codex'])
    expect(rates.fetchInactiveClaudeAccountsOnOpen).toHaveBeenCalledOnce()
    expect(rates.fetchInactiveCodexAccountsOnOpen).toHaveBeenCalledOnce()
    await command(client, ['rate-limit', 'refresh'])
    await command(client, ['rate-limit', 'refresh', '--provider', 'minimax'])
    await command(client, ['rate-limit', 'refresh', '--provider', 'grok'])
    expect(rates.refresh).toHaveBeenCalledTimes(2)
    expect(rates.refreshGrok).toHaveBeenCalledOnce()
    await command(client, ['rate-limit', 'observe', '--count', '2', '--interval-ms', '1'])
    expect(rates.getState).toHaveBeenCalledTimes(2)
  })
  it('preserves the reset retry key and exact offer, and propagates rejection before provider writes', async () => {
    const { client, runtime } = setup()
    const consume = vi
      .spyOn(runtime, 'consumeCodexRateLimitResetCredit')
      .mockRejectedValue(new Error('fixture-offer-rejected'))
    const expectedScope = {
      target: { runtime: 'host', wslDistro: null },
      accountId: 'account-1',
      accountRevision: 3,
      offerRevision: 'v1:fixture'
    }
    const idempotencyKey = '57ac547f-c31f-48ae-b8cd-8219007e1122'
    await expect(
      command(client, [
        'rate-limit',
        'consume-codex-reset-credit',
        '--idempotency-key',
        idempotencyKey,
        '--expected-scope',
        JSON.stringify(expectedScope)
      ])
    ).rejects.toThrow('fixture-offer-rejected')
    expect(consume).toHaveBeenCalledExactlyOnceWith(idempotencyKey, expectedScope)
    await expect(
      command(client, [
        'rate-limit',
        'consume-codex-reset-credit',
        '--idempotency-key',
        'wrong',
        '--expected-scope',
        '{}'
      ])
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(consume).toHaveBeenCalledTimes(1)
  })

  it('fails explicitly on an older host without retrying against a local provider', async () => {
    const { client, rates } = setup()
    const call = vi
      .spyOn(client, 'call')
      .mockRejectedValue(new Error('method_not_found:usage.getSummary'))
    await expect(command(client, ['usage', 'summary', '--provider', 'codex'])).rejects.toThrow(
      'method_not_found'
    )
    expect(call).toHaveBeenCalledTimes(1)
    expect(rates.refresh).not.toHaveBeenCalled()
  })

  it('streams the same service state and removes its listener when the owning connection is cleaned up', async () => {
    const { registry, runtime, rates } = setup()
    const method = registry.get('rateLimits.subscribe')
    if (!method || !isStreamingMethod(method)) {
      throw new Error('missing_rate_limit_subscription')
    }
    const unsubscribe = vi.fn()
    rates.onStateChange.mockReturnValue(unsubscribe)
    const emit = vi.fn()
    const done = method.handler(undefined, { runtime, connectionId: 'fixture-connection' }, emit)
    const ready = emit.mock.calls[0]?.[0]
    expect(ready).toMatchObject({ type: 'ready', state: rates.getState() })
    const listener = rates.onStateChange.mock.calls[0]?.[0]
    if (!listener) {
      throw new Error('missing_service_listener')
    }
    listener(rates.getState())
    expect(emit).toHaveBeenLastCalledWith({ type: 'snapshot', state: rates.getState() })
    runtime.cleanupSubscription(ready.subscriptionId)
    await done
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenLastCalledWith({ type: 'end' })
  })
  it('rejects an SSH-forwarded control-plane call before it can read client-host usage', async () => {
    const { client, rates } = setup()
    const call = vi.spyOn(client, 'call')
    vi.stubEnv('ORCA_CLI_CWD', '/remote/folder')
    try {
      await expect(
        command(client, ['usage', 'scan-state', '--provider', 'claude'])
      ).rejects.toMatchObject({ code: 'invalid_environment' })
      await expect(command(client, ['rate-limit', 'refresh'])).rejects.toMatchObject({
        code: 'invalid_environment'
      })
      expect(call).not.toHaveBeenCalled()
      expect(rates.refresh).not.toHaveBeenCalled()
      vi.spyOn(client, 'isRemote', 'get').mockReturnValue(true)
      vi.spyOn(console, 'log').mockImplementation(() => {})
      await command(client, ['usage', 'scan-state', '--provider', 'claude'])
      expect(call).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
