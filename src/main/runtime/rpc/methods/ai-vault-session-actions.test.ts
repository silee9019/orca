import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import { OrcaRuntimeService } from '../../orca-runtime'
import { AI_VAULT_SESSION_ACTION_METHODS } from './ai-vault-session-actions'
import { deleteAiVaultSession } from '../../../ipc/ai-vault-delete'
import { listAiVaultSubagentSessions } from '../../../ipc/ai-vault-subagent-list'
import { invalidateAiVaultHostLegCache } from '../../../ipc/ai-vault-host-leg-cache'

vi.mock('../../../ipc/ai-vault-delete', () => ({
  deleteAiVaultSession: vi.fn().mockResolvedValue({ outcome: 'deleted' })
}))
vi.mock('../../../ipc/ai-vault-subagent-list', () => ({
  listAiVaultSubagentSessions: vi.fn().mockResolvedValue({ sessions: [], issues: [] })
}))
vi.mock('../../../ipc/ai-vault-host-leg-cache', () => ({ invalidateAiVaultHostLegCache: vi.fn() }))

async function call(method: string, params: unknown) {
  const runtime = new OrcaRuntimeService()
  return new RpcDispatcher({ runtime, methods: AI_VAULT_SESSION_ACTION_METHODS }).dispatch({
    id: 'fixture',
    authToken: 'fixture',
    method,
    params
  })
}

describe('host-local transcript actions', () => {
  it('reuses the trash executor and all its cache invalidation', async () => {
    const args = { agent: 'claude', filePath: '/host/transcript.jsonl' }
    expect((await call('aiVault.deleteSession', args)).ok).toBe(true)
    expect(deleteAiVaultSession).toHaveBeenCalledWith(
      { ...args, executionHostId: 'local' },
      { invalidateMultiHostListCache: invalidateAiVaultHostLegCache }
    )
  })
  it('rejects a client-supplied host override before touching any transcript', async () => {
    vi.mocked(deleteAiVaultSession).mockClear()
    const response = await call('aiVault.deleteSession', {
      agent: 'claude',
      filePath: '/host/transcript.jsonl',
      executionHostId: 'ssh:other'
    })
    expect(response.ok).toBe(false)
    expect(deleteAiVaultSession).not.toHaveBeenCalled()
  })
  it('lists subagents only through the existing root-validated scanner', async () => {
    const args = { agent: 'omp', parentFilePath: '/host/parent.jsonl' }
    expect((await call('aiVault.listSubagentSessions', args)).ok).toBe(true)
    expect(listAiVaultSubagentSessions).toHaveBeenCalledWith({ ...args, executionHostId: 'local' })
  })
})
