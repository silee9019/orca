// @vitest-environment happy-dom
import { act } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import {
  guest,
  target,
  mount
} from '../../src/renderer/src/components/browser-pane/navigate/browser-client-command.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { applyBrowserClientHistoryRequest } from '../../src/renderer/src/runtime/browser-client-history-request'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { BROWSER_CLIENT_HISTORY_COMMAND_SPECS } from '../../src/cli/specs/browser-client-history'
import { BROWSER_CLIENT_HISTORY_HANDLERS } from '../../src/cli/handlers/browser-client-history'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { useAppStore } from '../../src/renderer/src/store'
it('routes parser/socket/dispatcher/service/request to the actual client guest owner with fake history readback and old-peer refusal', async () => {
  let index = 1
  const urls = ['https://first.test/', 'https://second.test/']
  const changed = () =>
    guest.dispatchEvent(Object.assign(new Event('did-navigate'), { url: urls[index] }))
  const back = vi.fn(() => {
    index -= 1
    changed()
  })
  const forward = vi.fn(() => {
    index += 1
    changed()
  })
  Object.assign(guest, {
    getURL: () => urls[index],
    canGoBack: () => index > 0,
    canGoForward: () => index < 1,
    goBack: back,
    goForward: forward
  })
  mount()
  const runtime = new OrcaRuntimeService()
  runtime.setNotifier({
    browserViewer: (command) => {
      if (command.operation !== 'client-history') {
        throw new Error('unsupported fixture command')
      }
      return applyBrowserClientHistoryRequest(command, Date.now() + 2000)
    }
  })
  const cli = await createRemotePaneCliSocket(runtime)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = async (action: string) => {
    const specs = BROWSER_CLIENT_HISTORY_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'client-history',
        '--viewer',
        'host',
        '--action',
        action,
        '--worktree',
        target.worktreeId,
        '--page',
        target.page,
        '--runtime-environment',
        target.environmentId,
        '--remote-page',
        target.remotePageId,
        '--browser-client',
        target.browserHostClientId,
        '--browser-host-generation',
        '3',
        '--page-host-generation',
        '4'
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_CLIENT_HISTORY_HANDLERS['browser client-history']({
      ...parsed,
      client: cli.client,
      cwd: '.',
      json: true
    })
  }
  try {
    await act(async () => {
      await run('back')
    })
    expect(index).toBe(0)
    expect(
      Object.values(useAppStore.getState().browserPagesByWorkspace)
        .flat()
        .find((page) => page.id === target.page)?.url
    ).toBe(urls[0])
    expect(output.mock.lastCall?.[0]).toContain('"completionObserved": false')
    await act(async () => {
      await run('forward')
    })
    expect(index).toBe(1)
    await expect(run('forward')).rejects.toThrow('history_unavailable')
    cli.useLegacyPeer()
    await expect(run('back')).rejects.toMatchObject({ code: 'incompatible_runtime' })
    expect(back).toHaveBeenCalledTimes(1)
    expect(forward).toHaveBeenCalledTimes(1)
  } finally {
    await cli.close()
    output.mockRestore()
  }
})
