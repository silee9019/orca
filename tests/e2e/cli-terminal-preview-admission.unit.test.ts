import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import * as terminalInput from '../../src/main/runtime/terminal-send-payload'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { readRuntimeMetadata } from '../../src/main/runtime/runtime-metadata'
import {
  createRuntime,
  syncSinglePty,
  TEST_WORKTREE_ID
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'

it('stops private preview input after a real runtime socket disconnect during validation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-preview-admission-'))
  const runtime = createRuntime(),
    ptyId = 'fixture-preview-admission',
    incarnationId = 'fixture-preview-incarnation'
  const server = new OrcaRuntimeRpcServer({ runtime, userDataPath: root, enableWebSocket: false })
  vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
  vi.spyOn(runtime, 'getDriver').mockReturnValue({ kind: 'idle' })
  const write = vi.fn(() => true)
  runtime.setPtyController({
    write,
    kill: () => {
      throw new Error('Unexpected kill')
    },
    getForegroundProcess: async () => null
  })
  syncSinglePty(runtime, ptyId)
  runtime.registerPty(ptyId, TEST_WORKTREE_ID, null, {
    tabId: 'tab-1',
    leafId: 'pane:1',
    incarnationId
  })
  const terminal = (await runtime.listTerminals()).terminals[0].handle
  let finish: () => void = () => {}
  const validation = vi
    .spyOn(terminalInput, 'assertTerminalInputWithinLimitWithYield')
    .mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
  let client: ReturnType<typeof createConnection> | undefined
  try {
    await server.start()
    const metadata = readRuntimeMetadata(root),
      endpoint = metadata?.transports?.find(
        (item) => item.kind === 'unix' || item.kind === 'named-pipe'
      )?.endpoint
    if (!metadata?.authToken || !endpoint) {
      throw new Error('Fixture metadata missing')
    }
    client = createConnection(endpoint)
    await new Promise<void>((resolve, reject) => {
      client?.once('connect', resolve)
      client?.once('error', reject)
    })
    client.write(
      `${JSON.stringify({ id: 'preview-cancel', authToken: metadata.authToken, method: 'terminal.previewInput', params: { terminal, expectedPtyId: ptyId, expectedIncarnationId: incarnationId, expectedExecutionHostId: 'local', confirm: true, data: 'private preview admission input' } })}\n`
    )
    await vi.waitFor(() => expect(validation).toHaveBeenCalled())
    client.destroy()
    await new Promise((resolve) => setTimeout(resolve, 50))
    finish()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(write).not.toHaveBeenCalled()
  } finally {
    finish()
    client?.destroy()
    await server.stop()
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  }
})
