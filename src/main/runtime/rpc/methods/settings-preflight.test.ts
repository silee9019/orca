import '../unused-default-rpc-methods.test-fixture'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { SETTINGS_CONTROL_METHODS } from './settings-control'

const probes = vi.hoisted(() => ({ check: vi.fn(), detect: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../preflight/agent-detection', () => ({
  runPreflightCheck: probes.check,
  detectInstalledAgentsWithShellPathHydration: probes.detect,
  refreshShellPathAndDetectAgents: probes.refresh
}))
beforeEach(() => vi.resetAllMocks())

function dispatch(method: string, params: unknown) {
  return new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: SETTINGS_CONTROL_METHODS
  }).dispatch({ id: 'fixture', authToken: 'fixture', method, params })
}

describe('settings preflight host and output boundary', () => {
  it('uses the existing native probe and redacts before the RPC envelope', async () => {
    probes.check.mockResolvedValue({
      git: { installed: true },
      gh: { installed: true, authenticated: true, account: 'secret-canary' },
      gitea: { configured: true, authenticated: true, baseUrl: 'url-canary' }
    })
    const result = await dispatch('settings.control.preflightCheck', { force: true })
    expect(result).toMatchObject({ ok: true, result: { git: { installed: true } } })
    expect(probes.check).toHaveBeenCalledExactlyOnceWith(true, { force: true })
    expect(JSON.stringify(result)).not.toContain('canary')
  })

  it('never probes a different host for unsupported or conflicting WSL selection', async () => {
    const conflicting = await dispatch('settings.control.detectAgents', {
      wslDistro: 'FixtureLinux',
      wslDefault: true
    })
    expect(conflicting).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    if (process.platform !== 'win32') {
      const unsupported = await dispatch('settings.control.detectAgents', {
        wslDistro: 'FixtureLinux'
      })
      expect(unsupported).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    }
    expect(probes.detect).not.toHaveBeenCalled()
  })

  it('refreshes through the existing service and omits environment path segments', async () => {
    probes.refresh.mockResolvedValue({
      agents: ['codex'],
      addedPathSegments: ['path-canary'],
      shellHydrationOk: true,
      pathSource: 'shell_hydrate',
      pathFailureReason: 'none'
    })
    const result = await dispatch('settings.control.refreshAgents', {})
    expect(result).toMatchObject({ ok: true, result: { agents: ['codex'] } })
    expect(probes.refresh).toHaveBeenCalledExactlyOnceWith({})
    expect(JSON.stringify(result)).not.toContain('canary')
  })
})
