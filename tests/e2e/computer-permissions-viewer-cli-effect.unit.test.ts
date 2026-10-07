// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { ComputerUsePermissionStatusResult } from '../../src/shared/computer-use-permissions-types'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { BROWSER_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/browser-viewer'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { COMPUTER_PERMISSIONS_VIEWER_SPECS } from '../../src/cli/specs/computer-permissions-viewer'
import { COMPUTER_PERMISSIONS_VIEWER_HANDLERS } from '../../src/cli/handlers/computer-permissions-viewer'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { requestComputerPermissionsViewer } from '../../src/renderer/src/runtime/computer-permissions-viewer-request'
import type { ComputerPermissionsViewerState } from '../../src/shared/rpc-contract/computer-permissions-viewer-params'
import { ComputerUsePane } from '../../src/renderer/src/components/settings/ComputerUsePane'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/renderer/src/components/settings/ComputerUseSkillSetupPanel', () => ({
  ComputerUseSkillSetupPanel: () => null
}))
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'refreshes the actual Computer Use permission pane through CLI/socket and local permission provider',
  async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const directory = mkdtempSync(join(tmpdir(), 'orca-perm-'))
    const store = new Store({
      serializedState: JSON.stringify({ repos: [], settings: {} }),
      dataFile: join(directory, 'profile.json')
    })
    const runtime = new OrcaRuntimeService(store)
    let status: ComputerUsePermissionStatusResult = {
      platform: 'darwin',
      helperAppPath: '/private/fixture-helper-path',
      helperUnavailableReason: null,
      permissions: [
        { id: 'accessibility', status: 'not-granted' },
        { id: 'screenshots', status: 'not-granted' }
      ]
    }
    let nextStatus: (() => Promise<ComputerUsePermissionStatusResult>) | undefined
    let releaseReset = (): void => {}
    const reset = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseReset = resolve
      })
      return { ...status, bundleId: 'fixture.bundle' }
    })
    const getStatus = vi.fn(async () =>
      nextStatus ? await nextStatus() : { ...status, permissions: [...status.permissions] }
    )
    Object.assign(window, {
      api: {
        computerUsePermissions: {
          getStatus,
          openSetup: () => {
            throw new Error('Fixture refuses native setup')
          },
          reset
        }
      }
    })
    useAppStore.setState({
      settings: store.getSettings(),
      persistedUIReady: true,
      activeView: 'settings',
      activeModal: 'none'
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const renderOwner = async (copies = 1): Promise<void> => {
      await act(async () =>
        root.render(
          createElement(
            'div',
            {},
            Array.from({ length: copies }, (_, i) => createElement(ComputerUsePane, { key: i }))
          )
        )
      )
    }
    await renderOwner()
    const notifier: Parameters<OrcaRuntimeService['setNotifier']>[0] = {
      browserViewer: async (command) => ({
        ...(await applyBrowserViewerRequest({
          id: 'permissions-fixture',
          expiresAt: Date.now() + 3000,
          command
        })),
        viewerId: 9
      })
    }
    runtime.setNotifier(notifier)
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_VIEWER_METHODS })
    const sockets = new Set<Socket>()
    const server = createServer((socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      let pending = ''
      socket.on('data', (chunk) => {
        pending += chunk.toString()
        const boundary = pending.indexOf('\n')
        if (boundary === -1) {
          return
        }
        const request = JSON.parse(pending.slice(0, boundary))
        pending = pending.slice(boundary + 1)
        if (request.authToken !== 'fixture-token') {
          socket.destroy()
          return
        }
        void dispatcher
          .dispatch(request)
          .then((response) => socket.write(`${JSON.stringify(response)}\n`))
      })
    })
    const endpoint = join(directory, 'runtime.sock')
    await new Promise<void>((resolve) => server.listen(endpoint, resolve))
    writeFileSync(
      join(directory, 'orca-runtime.json'),
      JSON.stringify({
        runtimeId: runtime.getRuntimeId(),
        pid: process.pid,
        transports: [{ kind: 'unix', endpoint }],
        authToken: 'fixture-token',
        startedAt: 1
      })
    )
    const client = new RuntimeClient(directory, 5000, null, null)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errors = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const invoke = async (action: string): Promise<void> => {
      const specs = COMPUTER_PERMISSIONS_VIEWER_SPECS
      const parsed = parseArgs(
        ['computer', 'permissions', 'viewer', '--viewer', 'host', '--action', action],
        specs.map((s) => s.path),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      const pending = COMPUTER_PERMISSIONS_VIEWER_HANDLERS['computer permissions viewer']({
        client,
        flags: parsed.flags,
        cwd: directory,
        json: true
      })
      let settled = false
      void pending.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        }
      )
      await vi.waitFor(async () => {
        await act(async () => {})
        expect(settled).toBe(true)
      })
      await pending
    }
    let releaseStatus = (): void => {}
    try {
      expect(getStatus).toHaveBeenCalledTimes(1)
      status = {
        ...status,
        permissions: [
          { id: 'accessibility', status: 'granted' },
          { id: 'screenshots', status: 'not-granted' }
        ]
      }
      await invoke('refresh')
      expect(getStatus).toHaveBeenCalledTimes(2)
      expect(container.textContent).toContain('1 permission required')
      expect(
        JSON.parse(output.mock.calls.at(-1)?.[0]).result.computerPermissions.permissions
      ).toEqual(status.permissions)
      expect(output.mock.calls.at(-1)?.[0]).not.toContain('/private/fixture-helper-path')
      await act(async () =>
        useAppStore.setState({
          settings: {
            ...store.getSettings(),
            activeRuntimeEnvironmentId: 'fixture-remote-selection'
          }
        })
      )
      await invoke('refresh')
      expect(JSON.parse(output.mock.calls.at(-1)?.[0]).result.viewerId).toBe(9)
      expect(
        JSON.parse(output.mock.calls.at(-1)?.[0]).result.computerPermissions.permissions
      ).toEqual(status.permissions)
      await act(async () => useAppStore.setState({ settings: store.getSettings() }))
      const count = getStatus.mock.calls.length
      await renderOwner(2)
      const mountedCount = getStatus.mock.calls.length
      expect(mountedCount).toBeGreaterThanOrEqual(count)
      await expect(invoke('refresh')).rejects.toThrow('computer_permissions_owner_ambiguous')
      expect(getStatus).toHaveBeenCalledTimes(mountedCount)
      await renderOwner(1)
      await act(async () => useAppStore.setState({ activeModal: 'quick-open' }))
      await expect(invoke('refresh')).rejects.toThrow('viewer_modal_busy')
      await act(async () => useAppStore.setState({ activeModal: 'none' }))
      nextStatus = async () => {
        throw new Error('private-provider-error')
      }
      await expect(invoke('refresh')).rejects.toThrow(
        'computer_permissions_refresh_failed_effect_unknown'
      )
      expect(errors).toHaveBeenCalled()
      expect(JSON.stringify(output.mock.calls)).not.toContain('private-provider-error')
      let started = false
      const older = status
      nextStatus = async () => {
        started = true
        await new Promise<void>((resolve) => {
          releaseStatus = resolve
        })
        return older
      }
      const superseded = invoke('refresh')
      void superseded.catch(() => {})
      await vi.waitFor(() => expect(started).toBe(true))
      nextStatus = undefined
      status = {
        ...status,
        permissions: [
          { id: 'accessibility', status: 'granted' },
          { id: 'screenshots', status: 'granted' }
        ]
      }
      const refreshButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Refresh'
      )
      await act(async () => refreshButton?.click())
      expect(container.textContent).toContain('Computer Use is ready.')
      releaseStatus()
      await expect(superseded).rejects.toThrow('computer_permissions_refresh_failed_effect_unknown')
      expect(container.textContent).toContain('Computer Use is ready.')
      let beforeCommit: Promise<ComputerPermissionsViewerState> | undefined
      await act(async () => {
        beforeCommit = requestComputerPermissionsViewer({ action: 'refresh' }, Date.now() + 3000)
        void beforeCommit.catch(() => {})
        for (let turn = 0; turn < 20; turn++) {
          await Promise.resolve()
        }
        refreshButton?.click()
        for (let turn = 0; turn < 20; turn++) {
          await Promise.resolve()
        }
      })
      await expect(beforeCommit).rejects.toThrow(
        'computer_permissions_refresh_failed_effect_unknown'
      )
      started = false
      nextStatus = async () => {
        started = true
        await new Promise<void>((resolve) => {
          releaseStatus = resolve
        })
        return older
      }
      const changedViewer = invoke('refresh')
      void changedViewer.catch(() => {})
      await vi.waitFor(() => expect(started).toBe(true))
      await act(async () => {
        useAppStore.setState({ activeModal: 'quick-open' })
        releaseStatus()
      })
      await expect(changedViewer).rejects.toThrow(
        'computer_permissions_refresh_failed_effect_unknown'
      )
      expect(container.textContent).toContain('Computer Use is ready.')
      await act(async () => useAppStore.setState({ activeModal: 'none' }))
      nextStatus = undefined
      const beforeResetCount = getStatus.mock.calls.length
      let duringReset: Promise<ComputerPermissionsViewerState> | undefined
      const resetButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Reset access'
      )
      await act(async () => {
        resetButton?.click()
        duringReset = requestComputerPermissionsViewer({ action: 'refresh' }, Date.now() + 3000)
        void duringReset.catch(() => {})
      })
      await expect(duringReset).rejects.toThrow('computer_permissions_reset_busy')
      expect(reset).toHaveBeenCalledTimes(1)
      expect(getStatus).toHaveBeenCalledTimes(beforeResetCount)
      await act(async () => releaseReset())
      status = {
        ...status,
        platform: 'linux',
        permissions: [
          { id: 'accessibility', status: 'unsupported' },
          { id: 'screenshots', status: 'unsupported' }
        ]
      }
      await invoke('refresh')
      const linuxCount = getStatus.mock.calls.length
      await expect(invoke('refresh')).rejects.toThrow('computer_permissions_refresh_unavailable')
      await invoke('status')
      expect(getStatus).toHaveBeenCalledTimes(linuxCount)
      expect(JSON.parse(output.mock.calls.at(-1)?.[0]).result.computerPermissions.platform).toBe(
        'linux'
      )
      expect(JSON.stringify(output.mock.calls)).not.toContain('/private/fixture-helper-path')
      await expect(
        requestComputerPermissionsViewer({ action: 'refresh' }, Date.now() - 1)
      ).rejects.toThrow('computer_permissions_request_expired')
      await expect(
        client.call('ui.browserViewer', {
          viewer: 'paired',
          operation: 'computer-permissions',
          command: { action: 'refresh' }
        })
      ).rejects.toThrow()
      runtime.setNotifier({})
      await expect(invoke('status')).rejects.toThrow('renderer_unavailable')
      runtime.setNotifier(notifier)
      expect(getStatus).toHaveBeenCalledTimes(linuxCount)
      await renderOwner(0)
      status = {
        ...status,
        platform: 'darwin',
        permissions: [
          { id: 'accessibility', status: 'granted' },
          { id: 'screenshots', status: 'granted' }
        ]
      }
      await renderOwner(1)
      started = false
      nextStatus = async () => {
        started = true
        await new Promise<void>((resolve) => {
          releaseStatus = resolve
        })
        return older
      }
      const unmounted = invoke('refresh')
      void unmounted.catch(() => {})
      await vi.waitFor(() => expect(started).toBe(true))
      await renderOwner(0)
      await expect(unmounted).rejects.toThrow('computer_permissions_owner_changed_effect_unknown')
      releaseStatus()
      nextStatus = undefined
      await renderOwner(1)
      expect(container.textContent).toContain('Computer Use is ready.')
      const inactiveCount = getStatus.mock.calls.length
      await act(async () => useAppStore.setState({ activeView: 'dashboard' }))
      await expect(invoke('refresh')).rejects.toThrow('computer_permissions_settings_inactive')
      expect(getStatus).toHaveBeenCalledTimes(inactiveCount)
      await act(async () => useAppStore.setState({ activeView: 'settings' }))
    } finally {
      await act(async () => {
        releaseStatus()
        releaseReset()
        root.unmount()
      })
      container.remove()
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
      vi.restoreAllMocks()
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
