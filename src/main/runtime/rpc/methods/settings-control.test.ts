import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { RuntimeClientSettingsController } from '../../runtime-client-settings'
import { RpcDispatcher } from '../dispatcher'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
import { SETTINGS_CONTROL_METHODS } from './settings-control'

describe('safe settings RPC', () => {
  it('uses the runtime controller and removes secret values before the response envelope', async () => {
    let settings = createGlobalSettingsFixture({
      agentDefaultEnv: { codex: { KEY: 'secret-canary' } }
    })
    const updateSettings = vi.fn((updates) => {
      settings = { ...settings, ...updates }
      return settings
    })
    const controller = new RuntimeClientSettingsController({
      getSettings: () => settings,
      updateSettings
    })
    const runtime = new OrcaRuntimeService()
    vi.spyOn(runtime, 'getClientSettings').mockImplementation(() => controller.get())
    vi.spyOn(runtime, 'updateClientSettings').mockImplementation((updates) =>
      controller.update(updates)
    )
    const dispatcher = new RpcDispatcher({ runtime, methods: SETTINGS_CONTROL_METHODS })
    const result = await dispatcher.dispatch({
      id: 'update',
      authToken: 'fixture',
      method: 'settings.control.update',
      params: { machineName: 'build-host', agentDefaultEnv: { codex: { KEY: 'updated-canary' } } }
    })
    expect(result).toMatchObject({ ok: true, result: { settings: { machineName: 'build-host' } } })
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith(
      {
        machineName: 'build-host',
        agentDefaultEnv: { codex: { KEY: 'updated-canary' } }
      },
      { notifyListeners: true }
    )
    expect(settings.agentDefaultEnv).toEqual({ codex: { KEY: 'updated-canary' } })
    expect(JSON.stringify(result)).not.toContain('canary')
    const read = await dispatcher.dispatch({
      id: 'read',
      authToken: 'fixture',
      method: 'settings.control.get'
    })
    expect(read).toMatchObject({ ok: true, result: { settings: { machineName: 'build-host' } } })
    expect(JSON.stringify(read)).not.toContain('canary')
  })

  it('reports a missing desktop service without claiming persistence', async () => {
    const runtime = new OrcaRuntimeService()
    const dispatcher = new RpcDispatcher({ runtime, methods: SETTINGS_CONTROL_METHODS })
    const result = await dispatcher.dispatch({
      id: 'headless',
      authToken: 'fixture',
      method: 'settings.desktop.update',
      params: { theme: 'dark' }
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'settings_viewer_unavailable' } })
    expect(JSON.stringify(result)).not.toContain('persisted')
  })

  it('rejects malformed updates and authority grants before calling the writer', async () => {
    const runtime = new OrcaRuntimeService()
    const write = vi.spyOn(runtime, 'updateClientSettings')
    const dispatcher = new RpcDispatcher({ runtime, methods: SETTINGS_CONTROL_METHODS })
    for (const params of [
      { machineName: 7 },
      { pluginConsents: { unreviewed: 'trusted' } },
      { agentDefaultEnv: { codex: { KEY: 7 } } },
      { nestedWorkerMaxDepth: 99 }
    ]) {
      const result = await dispatcher.dispatch({
        id: 'invalid',
        authToken: 'fixture',
        method: 'settings.control.update',
        params
      })
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    }
    expect(write).not.toHaveBeenCalled()
  })
})
