import { afterEach, expect, it, vi } from 'vitest'
import { createServer, type Socket } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getRuntimeMetadataPath } from '../../src/shared/runtime-bootstrap'
import { parseArgs } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS } from '../../src/cli/specs/codex-account-observe'
import { CODEX_ACCOUNT_OBSERVE_HANDLERS } from '../../src/cli/handlers/codex-account-observe'
import { CODEX_LOGIN_OBSERVATION_METHODS } from '../../src/main/runtime/rpc/methods/codex-login-observation'
import type { RpcContext } from '../../src/main/runtime/rpc/core'
afterEach(() => vi.restoreAllMocks())
async function fixture(
  serve: (socket: Socket, request: { id: string; method: string; authToken: string }) => void
) {
  const dir = await mkdtemp(join(tmpdir(), 'orca-o-'))
  const endpoint =
    process.platform === 'win32' ? `\\\\.\\pipe\\orca-observe-${randomUUID()}` : join(dir, 's')
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.setEncoding('utf8')
    let input = ''
    socket.on('data', (chunk: string) => {
      input += chunk
      if (input.includes('\n')) {
        serve(socket, JSON.parse(input.trim()))
      }
    })
  })
  server.listen(endpoint)
  await once(server, 'listening')
  await writeFile(
    getRuntimeMetadataPath(dir),
    JSON.stringify({
      runtimeId: 'fixture-runtime',
      pid: process.pid,
      transports: [{ kind: process.platform === 'win32' ? 'named-pipe' : 'unix', endpoint }],
      authToken: 'fixture-secret-token',
      startedAt: 0
    })
  )
  return {
    client: new RuntimeClient(dir, 1000, null, null),
    dir,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(dir, { recursive: true, force: true })
    }
  }
}
it('runs parser to CLI to selected local socket to actual RPC, preserving every revision and cleaning server observer on timeout', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  let subscribers = 0
  let cleaned = 0
  const f = await fixture((socket, request) => {
    expect(request.method).toBe('accounts.observeCodexLogin')
    expect(request.authToken).toBe('fixture-secret-token')
    const abort = new AbortController()
    socket.once('close', () => abort.abort())
    const observeCodexLogin = (listener: (pending: boolean, revision: number) => void) => {
      subscribers++
      listener(false, 0)
      listener(true, 1)
      listener(true, 2)
      listener(false, 3)
      return () => {
        cleaned++
      }
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fixed streaming method reads only this observer callback and its per-socket abort signal.
    const context = {
      runtime: { observeCodexLogin },
      signal: abort.signal
    } as unknown as RpcContext
    void CODEX_LOGIN_OBSERVATION_METHODS[0].handler(undefined, context, (event) => {
      const frame = `${JSON.stringify({
        id: request.id,
        ok: true,
        streaming: true,
        _meta: { runtimeId: 'fixture-runtime' },
        result: event
      })}\n`
      socket.write(frame.slice(0, 17))
      socket.write(frame.slice(17))
    })
  })
  try {
    const parsed = parseArgs(
      ['accounts', 'observe-codex-stream', '--timeout', '250', '--json'],
      CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS.map((s) => s.path),
      CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS
    )
    await CODEX_ACCOUNT_OBSERVE_HANDLERS[parsed.commandPath.join(' ')]({
      client: f.client,
      cwd: f.dir,
      flags: parsed.flags,
      json: true
    })
    const output = log.mock.calls.map(([line]) => JSON.parse(String(line)))
    expect(output.slice(0, 4).map((e) => [e.event, e.pending, e.revision])).toEqual([
      ['ready', false, 0],
      ['changed', true, 1],
      ['changed', true, 2],
      ['changed', false, 3]
    ])
    expect(output[4]).toMatchObject({ event: 'end', reason: 'timeout' })
    expect(JSON.stringify(output)).not.toContain('fixture-secret-token')
    expect(subscribers).toBe(1)
    await vi.waitFor(() => expect(cleaned).toBe(1))
  } finally {
    await f.close()
  }
})
it.each(['wrong-id', 'oversized', 'wrong-domain', 'out-of-order', 'old-host'])(
  'fails closed for %s and destroys the observer connection',
  async (mode) => {
    const f = await fixture((socket, request) => {
      if (mode === 'oversized') {
        socket.write('x'.repeat(65537))
        return
      }
      if (mode === 'old-host') {
        socket.write(
          `${JSON.stringify({
            id: request.id,
            ok: false,
            error: { code: 'method_not_found', message: 'Unsupported Codex observation' },
            _meta: { runtimeId: 'fixture-runtime' }
          })}\n`
        )
        return
      }
      socket.write(
        `${JSON.stringify({
          id: mode === 'wrong-id' ? 'other' : request.id,
          ok: true,
          _meta: { runtimeId: 'fixture-runtime' },
          result:
            mode === 'wrong-domain'
              ? { type: 'snapshot', accounts: [] }
              : { type: 'ready', pending: false, revision: mode === 'out-of-order' ? 2 : 0 }
        })}\n`
      )
    })
    try {
      await expect(
        f.client.observeCodexLogin(1000, new AbortController().signal, vi.fn())
      ).rejects.toThrow()
    } finally {
      await f.close()
    }
  }
)
it('aborts the socket after ready and suppresses subsequent frames', async () => {
  const abort = new AbortController()
  const received = vi.fn(() => abort.abort())
  const f = await fixture((socket, request) => {
    socket.write(
      `${JSON.stringify({
        id: request.id,
        ok: true,
        _meta: { runtimeId: 'fixture-runtime' },
        result: { type: 'ready', pending: false, revision: 0 }
      })}\n${JSON.stringify({
        id: request.id,
        ok: true,
        _meta: { runtimeId: 'fixture-runtime' },
        result: { type: 'changed', pending: true, revision: 1 }
      })}\n`
    )
  })
  try {
    expect(await f.client.observeCodexLogin(1000, abort.signal, received)).toBe('cancelled')
    expect(received).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})
