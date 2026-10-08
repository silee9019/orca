import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { EventEmitter, once } from 'node:events'
import type * as ChildProcess from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const processFixture = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcess>()),
  fork: processFixture.fork
}))
import { main } from '../../src/cli/index'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import {
  COMPUTER_METHODS,
  resetComputerSessionsForTest
} from '../../src/main/runtime/rpc/methods/computer'
import { getRuntimeMetadataPath } from '../../src/shared/runtime-bootstrap'

const SocketRequest = z.object({
  id: z.string(),
  authToken: z.string(),
  method: z.string(),
  params: z.unknown()
})
const SidecarRequest = z.object({
  id: z.number(),
  method: z.string(),
  params: z.record(z.string(), z.unknown())
})

class FixtureComputerProvider extends EventEmitter {
  killed = false
  readonly effects: { method: string; params: Record<string, unknown> }[] = []
  text = ''
  scroll = 0
  send(value: unknown, callback?: (error: Error | null) => void): boolean {
    const { id, method, params } = SidecarRequest.parse(value)
    callback?.(null)
    queueMicrotask(() => {
      if (params.app === 'denied') {
        this.emit('message', {
          id,
          ok: false,
          error: { code: 'permission_denied', message: 'Fixture permission denied' }
        })
        return
      }
      let result: unknown
      if (method === 'capabilities') {
        result = { provider: 'fixture', supports: { screenshots: false } }
      } else if (method === 'listApps') {
        result = { apps: [{ name: 'FixtureApp' }] }
      } else if (method === 'listWindows') {
        result = { windows: [{ windowId: 9 }] }
      } else if (method === 'getAppState') {
        result = {
          text: this.text,
          scroll: this.scroll,
          effects: this.effects.length,
          app: params.app,
          windowId: params.windowId
        }
      } else {
        this.effects.push({ method, params })
        if (method === 'typeText' || method === 'pasteText') {
          this.text += String(params.text)
        }
        if (method === 'setValue') {
          this.text = String(params.value)
        }
        if (method === 'scroll') {
          this.scroll += params.direction === 'down' ? 1 : -1
        }
        result = { action: { path: 'synthetic' }, snapshot: { text: this.text } }
      }
      this.emit('message', { id, ok: true, result })
    })
    return true
  }
  kill(): boolean {
    this.killed = true
    return true
  }
}

afterEach(() => {
  resetComputerSessionsForTest()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.exitCode = undefined
})

describe('computer CLI with an isolated socket and sidecar protocol provider', () => {
  it('runs all 13 baseline commands and reads provider state after each action without starting an OS process', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'orca-computer-provider-'))
    const endpoint = path.join(dir, 'runtime.sock')
    const provider = new FixtureComputerProvider()
    processFixture.fork.mockReturnValue(provider)
    const runtime = new OrcaRuntimeService()
    const dispatcher = new RpcDispatcher({ runtime, methods: COMPUTER_METHODS })
    const server = createServer((socket) => {
      socket.setEncoding('utf8')
      let pending = ''
      socket.on('data', (chunk) => {
        pending += chunk.toString()
        const index = pending.indexOf('\n')
        if (index === -1) {
          return
        }
        const request = SocketRequest.parse(JSON.parse(pending.slice(0, index)))
        pending = pending.slice(index + 1)
        if (request.authToken !== 'fixture-token') {
          throw new Error('Wrong fixture token')
        }
        void dispatcher.dispatch(request).then((reply) => socket.end(`${JSON.stringify(reply)}\n`))
      })
    })
    server.listen(endpoint)
    await once(server, 'listening')
    try {
      await writeFile(
        getRuntimeMetadataPath(dir),
        JSON.stringify({
          runtimeId: runtime.getRuntimeId(),
          pid: process.pid,
          transports: [{ kind: 'unix', endpoint }],
          authToken: 'fixture-token',
          startedAt: Date.now()
        })
      )
      for (const name of ['ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING', 'ORCA_ENVIRONMENT']) {
        vi.stubEnv(name, '')
      }
      vi.stubEnv('ORCA_USER_DATA_PATH', dir)
      const output = vi.spyOn(console, 'log').mockImplementation(() => {})
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      for (const args of [
        ['capabilities'],
        ['list-apps'],
        ['list-windows', '--app', 'FixtureApp']
      ]) {
        await main(['computer', ...args, '--json'], dir)
        expect(process.exitCode, JSON.stringify(errors.mock.calls)).toBeUndefined()
      }
      const actions = [
        ['click', '--x', '10', '--y', '20'],
        ['drag', '--from-x', '1', '--from-y', '2', '--to-x', '3', '--to-y', '4'],
        ['hotkey', '--key', 'Ctrl+A'],
        ['paste-text', '--text', 'pasted'],
        ['perform-secondary-action', '--element-index', '1', '--action', 'press'],
        ['press-key', '--key', 'Return'],
        ['scroll', '--x', '10', '--y', '20', '--direction', 'down'],
        ['set-value', '--element-index', '1', '--value', 'replaced'],
        ['type-text', '--text', '-typed']
      ]
      for (const [index, args] of actions.entries()) {
        await main(
          [
            'computer',
            ...args,
            '--app',
            'FixtureApp',
            '--window-id',
            '9',
            '--no-screenshot',
            '--json'
          ],
          dir
        )
        expect(process.exitCode, JSON.stringify(errors.mock.calls)).toBeUndefined()
        expect(provider.effects).toHaveLength(index + 1)
        expect(provider.effects[index]?.params).toMatchObject({ app: 'FixtureApp', windowId: 9 })
        await main(
          [
            'computer',
            'get-app-state',
            '--app',
            'FixtureApp',
            '--window-id',
            '9',
            '--no-screenshot',
            '--json'
          ],
          dir
        )
        expect(process.exitCode, JSON.stringify(errors.mock.calls)).toBeUndefined()
        expect(output).toHaveBeenLastCalledWith(expect.stringContaining(`"effects": ${index + 1}`))
      }
      expect(provider.text).toBe('replaced-typed')
      expect(provider.scroll).toBe(1)
      expect(new Set(provider.effects.map((effect) => effect.method)).size).toBe(9)
      await main(['computer', 'click', '--app', 'denied', '--x', '1', '--y', '2', '--json'], dir)
      expect(process.exitCode).toBe(1)
      expect(provider.effects).toHaveLength(9)
      expect(processFixture.fork).toHaveBeenCalledTimes(1)
    } finally {
      resetComputerSessionsForTest()
      expect(provider.killed).toBe(true)
      server.close()
      await once(server, 'close')
      await rm(dir, { recursive: true, force: true })
    }
  })
})
