// @vitest-environment happy-dom
import { act, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import {
  mount,
  target,
  guest
} from '../../src/renderer/src/components/browser-pane/navigate/browser-client-command.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { requestBrowserClientInputFeedback } from '../../src/renderer/src/runtime/browser-client-input-feedback-request'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { BROWSER_CLIENT_INPUT_FEEDBACK_COMMAND_SPECS } from '../../src/cli/specs/browser-client-input-feedback'
import { BROWSER_CLIENT_INPUT_FEEDBACK_HANDLERS } from '../../src/cli/handlers/browser-client-input-feedback'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { useAppStore } from '../../src/renderer/src/store'
import { stageWebRuntimeBrowserTab } from '../../src/renderer/src/runtime/web-runtime-browser-tab-staging'
import { defineMethod } from '../../src/main/runtime/rpc/core'
import { BrowserClientSubmissionViewerCommand } from '../../src/shared/rpc-contract/browser-client-submission-params'
it('routes parser/socket/dispatcher/service to actual client input writer and DOM with no file/guest navigation', async () => {
  const view = mount()
  const runtime = new OrcaRuntimeService()
  runtime.setNotifier({
    browserViewer: async (command) => {
      if (command.operation !== 'client-input-feedback') {
        throw new Error('unsupported fixture command')
      }
      return {
        viewer: 'host',
        viewerId: 0,
        persisted: false,
        rendered: false,
        applied: true,
        clientInputFeedback: await requestBrowserClientInputFeedback(command, Date.now() + 2000)
      }
    }
  })
  const cli = await createRemotePaneCliSocket(runtime)
  const legacyHandler = vi.fn(() => {
    throw new Error('legacy must refuse before handler')
  })
  const legacy = await createRemotePaneCliSocket(runtime, [
    defineMethod({
      name: 'ui.browserViewer',
      params: BrowserClientSubmissionViewerCommand,
      handler: legacyHandler
    })
  ])
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = async (value: string, client = cli.client, staged = false) => {
    const specs = BROWSER_CLIENT_INPUT_FEEDBACK_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'client-input-feedback',
        '--viewer',
        'host',
        '--value',
        value,
        '--worktree',
        target.worktreeId,
        '--page',
        target.page,
        '--runtime-environment',
        target.environmentId,
        '--remote-page',
        staged ? target.page : target.remotePageId,
        '--source-kind',
        staged ? 'staged' : 'materialized',
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
    await BROWSER_CLIENT_INPUT_FEEDBACK_HANDLERS['browser client-input-feedback']({
      ...parsed,
      client,
      cwd: '.',
      json: true
    })
  }
  try {
    for (const value of ['javascript:fixture-invalid', 'file:///fixture-refused.html']) {
      await act(async () => {
        await run(value)
      })
      const page = Object.values(useAppStore.getState().browserPagesByWorkspace)
        .flat()
        .find((page) => page.id === target.page)
      expect(page?.loadError?.code).toBe(0)
      expect(screen.getByText(page?.loadError?.description ?? 'missing error')).toBeTruthy()
      expect(output.mock.lastCall?.[0]).toContain('"inputRejected": true')
      if (value) {
        expect(output.mock.lastCall?.[0]).not.toContain(value)
      }
    }
    view.unmount()
    useAppStore.setState({
      browserPagesByWorkspace: {},
      browserTabsByWorktree: {},
      activeBrowserTabIdByWorktree: {},
      remoteBrowserPageHandlesByPageId: {}
    })
    stageWebRuntimeBrowserTab({
      environmentId: target.environmentId,
      worktreeId: target.worktreeId,
      remotePageId: target.page,
      activate: true,
      clientHosted: true
    })
    mount(
      true,
      () => target.worktreeId,
      true,
      (handle) => (handle?.placement?.kind === 'client' ? handle.placement : null)
    )
    await act(async () => {
      await run('file:///stage-refused.html', cli.client, true)
    })
    const stagedPage = Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((page) => page.id === target.page)
    expect(stagedPage?.loadError?.code).toBe(0)
    expect(screen.getByText(stagedPage?.loadError?.description ?? 'missing error')).toBeTruthy()
    expect(output.mock.lastCall?.[0]).toContain('"kind": "staged"')
    await expect(run('https://valid.test/')).rejects.toThrow('rejection_required')
    await expect(run('javascript:other', legacy.client)).rejects.toMatchObject({
      code: 'incompatible_runtime'
    })
    expect(legacyHandler).not.toHaveBeenCalled()
    expect(guest.loadURL).not.toHaveBeenCalled()
  } finally {
    await cli.close()
    await legacy.close()
    output.mockRestore()
  }
})
