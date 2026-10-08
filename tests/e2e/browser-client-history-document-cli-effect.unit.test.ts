// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import {
  target,
  mount,
  guest
} from '../../src/renderer/src/components/browser-pane/navigate/browser-client-command.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { applyBrowserClientHistoryDocumentRequest } from '../../src/renderer/src/runtime/browser-client-history-document-request'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { BROWSER_CLIENT_HISTORY_DOCUMENT_COMMAND_SPECS } from '../../src/cli/specs/browser-client-history-document'
import { BROWSER_CLIENT_HISTORY_DOCUMENT_HANDLERS } from '../../src/cli/handlers/browser-client-history-document'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { useAppStore } from '../../src/renderer/src/store'

it.each(['materialized', 'staged'] as const)(
  'routes %s history selection through the existing socket/service and actual ClientPane callback',
  async (kind) => {
    const root = join(tmpdir(), 'client-history-socket')
    const filePath = join(root, 'nested', 'fixture.html')
    const documentWorktreeId = 'folder:document'
    useAppStore.setState({
      folderWorkspaces: ['fixture', 'document'].map((id) => ({
        id,
        projectGroupId: 'fixture',
        name: id,
        folderPath: id === 'fixture' ? root : join(root, 'nested'),
        connectionId: 'ssh-fixture',
        linkedTask: null,
        comment: '',
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0,
        createdAt: 0,
        updatedAt: 0
      })),
      workspaceDocHistory: [
        {
          docLocation: { kind: 'workspace-doc', worktreeId: documentWorktreeId, filePath },
          title: 'Fixture document',
          lastVisitedAt: 1,
          visitCount: 1
        }
      ],
      ...(kind === 'staged'
        ? {
            remoteBrowserPageHandlesByPageId: {
              [target.page]: {
                environmentId: target.environmentId,
                remotePageId: target.remotePageId,
                staged: true,
                stagedClientHosted: true
              }
            }
          }
        : {})
    })
    mount(
      true,
      () => target.worktreeId,
      true,
      (handle) => handle?.placement ?? null
    )
    const openHistory = async () => {
      const input = screen.getByRole('combobox')
      await waitFor(() => {
        fireEvent.focus(input)
        fireEvent.change(input, { target: { value: '' } })
        expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
      })
      const index = screen
        .getAllByRole('option')
        .findIndex((row) => row.textContent?.includes(filePath))
      expect(index).toBeGreaterThanOrEqual(0)
      return index
    }
    const runtime = new OrcaRuntimeService()
    let staleReply = false
    const relay = vi.fn(
      async (command: Parameters<typeof applyBrowserClientHistoryDocumentRequest>[0]) => {
        const result = await applyBrowserClientHistoryDocumentRequest(command, Date.now() + 3000)
        return {
          ...result,
          private: 'private-fixture-value',
          clientHistoryDocument: {
            ...result.clientHistoryDocument,
            private: 'private-fixture-value',
            ...(staleReply
              ? { item: { ...result.clientHistoryDocument.item, worktreeId: 'folder:foreign' } }
              : {})
          }
        }
      }
    )
    runtime.setNotifier({
      browserViewer: (command) => {
        if (command.operation !== 'client-history-document') {
          throw new Error('unsupported fixture command')
        }
        return relay(command)
      }
    })
    const cli = await createRemotePaneCliSocket(runtime)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = async (index: number) => {
      const path = kind === 'staged' ? 'client-staged-history-document' : 'client-history-document'
      const specs = BROWSER_CLIENT_HISTORY_DOCUMENT_COMMAND_SPECS
      const parsed = parseArgs(
        [
          'browser',
          path,
          '--viewer',
          'host',
          '--worktree',
          target.worktreeId,
          '--page',
          target.page,
          '--runtime-environment',
          target.environmentId,
          '--remote-page',
          target.remotePageId,
          ...(kind === 'materialized'
            ? [
                '--browser-client',
                target.browserHostClientId,
                '--browser-host-generation',
                String(target.browserHostGeneration),
                '--page-host-generation',
                String(target.pageHostGeneration)
              ]
            : []),
          '--index',
          String(index),
          '--document-worktree',
          documentWorktreeId,
          '--value',
          filePath
        ],
        specs.map((spec) => spec.path),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      await BROWSER_CLIENT_HISTORY_DOCUMENT_HANDLERS[`browser ${path}`]({
        ...parsed,
        client: cli.client,
        cwd: '.',
        json: true
      })
    }
    try {
      const index = await openHistory()
      await act(async () => {
        await run(index)
      })
      const state = useAppStore.getState()
      expect(state.activeWorktreeId).toBe(documentWorktreeId)
      const workspaceId = state.activeBrowserTabIdByWorktree[documentWorktreeId]
      expect(state.browserPagesByWorkspace[workspaceId ?? '']).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            docLocation: { kind: 'workspace-doc', worktreeId: documentWorktreeId, filePath }
          })
        ])
      )
      expect(JSON.parse(output.mock.lastCall?.[0]).result.clientHistoryDocument).toMatchObject({
        selected: true,
        item: { index, worktreeId: documentWorktreeId, filePath },
        documentWorkspaceId: workspaceId
      })
      expect(output.mock.lastCall?.[0]).not.toContain('private-fixture-value')
      expect(guest.loadURL).not.toHaveBeenCalled()
      await act(async () => {
        useAppStore.getState().setActiveWorktree(target.worktreeId)
      })
      const nextIndex = await openHistory()
      staleReply = true
      await act(async () => {
        await expect(run(nextIndex)).rejects.toMatchObject({ code: 'runtime_error' })
      })
      expect(output).toHaveBeenCalledTimes(1)
      cli.useLegacyPeer()
      const calls = relay.mock.calls.length
      await expect(run(nextIndex)).rejects.toMatchObject({ code: 'method_not_found' })
      expect(relay).toHaveBeenCalledTimes(calls)
      expect(output).toHaveBeenCalledTimes(1)
    } finally {
      await cli.close()
      output.mockRestore()
    }
  }
)
