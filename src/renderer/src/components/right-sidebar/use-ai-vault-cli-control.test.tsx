// @vitest-environment happy-dom
import { mkdtemp, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppSurfaceAction, AppSurfaceRequest } from '../../../../shared/app-surface-control'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { registerAppSurfaceIpcBridge } from '../../hooks/ipc-events/app-surface-ipc-bridge'
import { usePersistedAiVaultViewOptions } from './use-persisted-ai-vault-view-options'
import { AI_VAULT_VIEW_OPTIONS_STORAGE_KEY } from './ai-vault-view-options-persistence'
import { useAiVaultCliControl } from './use-ai-vault-cli-control'
import { useAiVaultSessionDeleteAction } from './ai-vault-session-delete-action'
vi.mock('./ai-vault-session-log-open', () => ({ openAiVaultSessionLogInOrca: vi.fn() }))
vi.mock('./AiVaultPanelSearch', () => ({ enableAiVaultSearchFromPanel: vi.fn() }))
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => async () => false
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
afterEach(() => {
  delete window.orcaAppSurface
  localStorage.clear()
})
const requestId = 'c8d153e4-ef16-4da8-b972-2fd3cecb378b'
describe('AI Vault CLI parent effects', () => {
  it('persists view preferences and deletes only an exact host-qualified confirmed session', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orca-vault-surface-'))
    const filePath = join(dir, 'session.jsonl')
    await writeFile(filePath, 'fixture transcript')
    const session: AiVaultSession = {
      id: 'row',
      executionHostId: 'local',
      agent: 'claude',
      sessionId: 'session',
      filePath,
      title: 'private title',
      cwd: dir,
      branch: null,
      model: null,
      codexHome: null,
      createdAt: null,
      updatedAt: null,
      modifiedAt: '',
      messageCount: 1,
      totalTokens: 0,
      previewMessages: [],
      queuedMessageCount: 0,
      subagentTranscriptCount: 0,
      resumeCommand: '',
      subagent: null
    }
    let receive: ((request: AppSurfaceRequest) => void) | undefined
    const reply = vi.fn()
    window.orcaAppSurface = {
      onRequest: (callback) => {
        receive = callback
        return () => {}
      },
      reply
    }
    const remove = vi.fn(async (input: { filePath: string }) => {
      expect(input.filePath).toBe(filePath)
      await unlink(input.filePath)
      return { outcome: 'deleted' }
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { aiVault: { deleteSession: remove } }
    })
    const refresh = vi.fn(async () => {})
    const hook = renderHook(() => {
      const options = usePersistedAiVaultViewOptions()
      const requestDelete = useAiVaultSessionDeleteAction({ refresh })
      useAiVaultCliControl({
        options,
        sessions: [session],
        scope: 'all',
        setScope: vi.fn(),
        host: 'local',
        hosts: [{ id: 'local' }],
        setHost: vi.fn(),
        setQuery: vi.fn(),
        refresh,
        search: { loading: false, retry: vi.fn(), loadMore: vi.fn() },
        launch: {
          handleResume: vi.fn(),
          handleResumeInNewChat: vi.fn(),
          copyResumeCommand: vi.fn()
        },
        panes: {
          getOriginalPaneTarget: () => null,
          isStructuredSessionOpen: () => false,
          jumpToOriginalPane: vi.fn()
        },
        resumeState: () => ({
          blocked: false,
          worktreeId: 'fixture-workspace',
          usesSessionWorktree: false
        }),
        resumeInChat: () => ({ available: false, reason: 'workspace' }),
        requestDelete
      })
      return options
    })
    const cleanup = registerAppSurfaceIpcBridge()
    async function send(action: AppSurfaceAction): Promise<void> {
      reply.mockClear()
      await act(async () => receive?.({ requestId, action }))
      await waitFor(() => expect(reply).toHaveBeenCalledOnce())
    }
    try {
      await send({ kind: 'vault', action: 'group', group: 'agent' })
      await send({ kind: 'vault', action: 'agent', agent: 'codex', enabled: false })
      await send({ kind: 'vault', action: 'limit', limit: 500 })
      expect(hook.result.current.group).toBe('agent')
      expect(
        JSON.parse(localStorage.getItem(AI_VAULT_VIEW_OPTIONS_STORAGE_KEY) || '{}')
      ).toMatchObject({ group: 'agent', disabledAgents: ['codex'], sessionLimit: 500 })
      await send({
        kind: 'vault',
        action: 'delete',
        sessionId: 'session',
        host: 'ssh:other',
        agent: 'claude',
        confirmSessionId: 'session'
      })
      expect(reply.mock.lastCall?.[0]).toMatchObject({ ok: false })
      await send({
        kind: 'vault',
        action: 'delete',
        sessionId: 'session',
        host: 'local',
        agent: 'claude'
      })
      expect(reply.mock.lastCall?.[0]).toMatchObject({ ok: false })
      expect(remove).not.toHaveBeenCalled()
      expect((await stat(filePath)).isFile()).toBe(true)
      await send({
        kind: 'vault',
        action: 'delete',
        sessionId: 'session',
        host: 'local',
        agent: 'claude',
        confirmSessionId: 'session'
      })
      expect(reply.mock.lastCall?.[0]).toMatchObject({ ok: true })
      await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(refresh).toHaveBeenCalledWith({ force: true })
      await send({ kind: 'vault', action: 'status' })
      expect(JSON.stringify(reply.mock.lastCall)).not.toContain('private title')
    } finally {
      hook.unmount()
      cleanup()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
