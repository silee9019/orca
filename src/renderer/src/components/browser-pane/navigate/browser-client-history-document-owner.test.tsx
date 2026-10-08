// @vitest-environment happy-dom
import { mount, target, placement, guest } from './browser-client-command.test-fixture'
import { act, fireEvent, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { useAppStore } from '@/store'
import { requestBrowserClientHistoryDocument } from '@/runtime/browser-client-history-document-request'

it.each(['materialized', 'staged'] as const)(
  'uses the actual %s ClientPane and its original history selection callback',
  async (kind) => {
    const filePath = join(tmpdir(), 'client-history-source', 'nested', 'fixture.html')
    const destination = 'folder:inner'
    useAppStore.setState({
      folderWorkspaces: ['fixture', 'inner'].map((id) => ({
        id,
        projectGroupId: 'fixture',
        name: id,
        folderPath: join(tmpdir(), 'client-history-source', ...(id === 'inner' ? ['nested'] : [])),
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
          docLocation: { kind: 'workspace-doc', worktreeId: destination, filePath },
          title: 'Fixture',
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
      (handle) => (handle?.placement?.kind === 'client' ? handle.placement : null)
    )
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    const index = screen
      .getAllByRole('option')
      .findIndex((row) => row.textContent?.includes(filePath))
    expect(index).toBeGreaterThanOrEqual(0)
    let receipt: unknown
    await act(async () => {
      receipt = await requestBrowserClientHistoryDocument(
        {
          viewer: 'host',
          operation: 'client-history-document',
          source:
            kind === 'materialized'
              ? { kind, target: { ...target, browserHostClientId: placement.browserHostClientId } }
              : {
                  kind,
                  target: {
                    page: target.page,
                    worktreeId: target.worktreeId,
                    environmentId: target.environmentId,
                    remotePageId: target.remotePageId
                  }
                },
          item: { index, worktreeId: destination, filePath }
        },
        Date.now() + 5000
      )
    })
    expect(receipt).toMatchObject({ selected: true, item: { worktreeId: destination, filePath } })
    const state = useAppStore.getState()
    expect(state.activeWorktreeId).toBe(destination)
    const workspaceId = state.activeBrowserTabIdByWorktree[destination]
    expect(state.browserPagesByWorkspace[workspaceId ?? '']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          docLocation: { kind: 'workspace-doc', worktreeId: destination, filePath }
        })
      ])
    )
    expect(guest.loadURL).not.toHaveBeenCalled()
  }
)
