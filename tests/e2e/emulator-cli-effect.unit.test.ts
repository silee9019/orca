import type * as ImportedModule from '../../src/cli/handler-group-manifest'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { createServer } from 'node:net'
import { WebSocketServer } from 'ws'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('../../src/cli/handler-group-manifest', async () => {
  const actual = await vi.importActual<typeof ImportedModule>(
    '../../src/cli/handler-group-manifest'
  )
  return {
    ...actual,
    HANDLER_GROUPS: actual.HANDLER_GROUPS.map((group) =>
      group.name === 'emulator'
        ? {
            ...group,
            keys: [
              ...new Set([
                ...group.keys,
                'emulator availability',
                'emulator simulators',
                'emulator detach',
                'emulator observe',
                'emulator stream',
                'emulator key',
                'emulator control',
                'emulator focus'
              ])
            ]
          }
        : group
    )
  }
})

import { main } from '../../src/cli/index'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RuntimeEmulatorCommands } from '../../src/main/runtime/orca-runtime-emulator'
import { EmulatorBridge } from '../../src/main/emulator/emulator-bridge'
import { scrcpyVideoRegistry } from '../../src/main/emulator/scrcpy-video-registry'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { EMULATOR_METHODS } from '../../src/main/runtime/rpc/methods/emulator'
import { getRuntimeMetadataPath } from '../../src/shared/runtime-bootstrap'

const Request = z.object({
  id: z.string(),
  authToken: z.string(),
  method: z.string(),
  params: z.unknown().optional()
})
const deviceId = 'fixture-device'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  scrcpyVideoRegistry.stop(deviceId)
  process.exitCode = undefined
})

describe('emulator CLI over an isolated runtime socket', () => {
  it('types into the selected provider, observes its frame and reads back detach', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'orca-devices-socket-'))
    const endpoint = path.join(dir, 'runtime.sock')
    const controlServer = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    await once(controlServer, 'listening')
    const controlAddress = controlServer.address()
    if (!controlAddress || typeof controlAddress === 'string') {
      throw new Error('Missing control fixture address')
    }
    const controlFrames: unknown[] = []
    controlServer.on('connection', (socket) =>
      socket.on('message', (bytes) => {
        const data = Buffer.concat(
          Array.isArray(bytes) ? bytes : [bytes instanceof ArrayBuffer ? Buffer.from(bytes) : bytes]
        )
        controlFrames.push({ tag: data[0], frame: JSON.parse(data.subarray(1).toString()) })
      })
    )
    const runtime = new OrcaRuntimeService()
    const bridge = new EmulatorBridge()
    const session = {
      deviceUdid: deviceId,
      streamUrl: `scrcpy://${deviceId}`,
      wsUrl: `ws://127.0.0.1:${controlAddress.port}`,
      streamCodec: 'h264' as const
    }
    bridge.registerActiveEmulator('folder:mobile', session, { backend: 'android' })
    const provider = bridge.listBackends().find((backend) => backend.kind === 'android')
    if (!provider) {
      throw new Error('Missing Android provider')
    }
    const typed: string[] = []
    vi.spyOn(provider, 'ownsDevice').mockResolvedValue(true)
    const ios = bridge.listBackends().find((backend) => backend.kind === 'ios')
    if (!ios) {
      throw new Error('Missing iOS provider')
    }
    vi.spyOn(ios, 'ownsDevice').mockResolvedValue(false)
    vi.spyOn(provider, 'type').mockImplementation(async (_device, text) => {
      typed.push(text)
    })
    const commands = new RuntimeEmulatorCommands({
      getEmulatorBridge: () => bridge,
      resolveEmulatorWorkspaceId: async (selector) => {
        if (selector !== 'folder:mobile') {
          throw new Error('selector_not_found')
        }
        return selector
      },
      resolveEmulatorCleanupWorkspaceId: async (selector) => selector,
      getSettings: () => ({
        androidSdkPath: null,
        mobileEmulatorEnabled: true,
        mobileEmulatorDefaultDeviceUdid: null
      }),
      getAuthoritativeWindow: () => {
        throw new Error('Fixture has no viewer')
      }
    })
    vi.spyOn(runtime, 'emulatorStreamInfo').mockImplementation((params) =>
      commands.emulatorStreamInfo(params)
    )
    vi.spyOn(runtime, 'emulatorType').mockImplementation((params) => commands.emulatorType(params))
    vi.spyOn(runtime, 'emulatorUnregisterActive').mockImplementation((params) =>
      commands.emulatorUnregisterActive(params)
    )
    const dispatcher = new RpcDispatcher({ runtime, methods: EMULATOR_METHODS })
    const seen: string[] = []
    const server = createServer((socket) => {
      const controller = new AbortController()
      socket.once('close', () => controller.abort())
      socket.setEncoding('utf8')
      let pending = ''
      socket.on('data', (chunk) => {
        pending += chunk.toString()
        const end = pending.indexOf('\n')
        if (end === -1) {
          return
        }
        const request = Request.parse(JSON.parse(pending.slice(0, end)))
        pending = pending.slice(end + 1)
        if (request.authToken !== 'fixture-token') {
          throw new Error('Wrong fixture credential')
        }
        seen.push(request.method)
        void dispatcher.dispatchStreaming(request, (reply) => socket.write(`${reply}\n`), {
          connectionId: 'fixture-socket',
          signal: controller.signal
        })
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
      vi.stubEnv('ORCA_USER_DATA_PATH', dir)
      vi.stubEnv('ORCA_PAIRING_CODE', '')
      vi.stubEnv('ORCA_REMOTE_PAIRING', '')
      vi.stubEnv('ORCA_ENVIRONMENT', '')
      const output = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await main(
        ['emulator', 'type', '--text', 'fixture input', '--worktree', 'folder:mobile', '--json'],
        dir
      )
      expect(process.exitCode).toBeUndefined()
      expect(typed).toEqual(['fixture input'])
      expect(bridge.getActiveForWorktree('folder:mobile')).toEqual(session)
      scrcpyVideoRegistry.register(deviceId, vi.fn())
      scrcpyVideoRegistry.pushMeta(deviceId, { codecId: 'h264', width: 100, height: 200 })
      scrcpyVideoRegistry.pushFrame(deviceId, {
        config: true,
        keyFrame: false,
        pts: '0',
        bytes: new Uint8Array([1, 2]).buffer
      })
      scrcpyVideoRegistry.pushFrame(deviceId, {
        config: false,
        keyFrame: true,
        pts: '1',
        bytes: new Uint8Array([3, 4]).buffer
      })
      await main(['emulator', 'observe', '--worktree', 'folder:mobile', '--json'], dir)
      expect(process.exitCode).toBeUndefined()
      expect(output).toHaveBeenLastCalledWith(expect.stringContaining('AwQ='))
      expect(scrcpyVideoRegistry.has(deviceId)).toBe(true)
      await main(
        [
          'emulator',
          'stream',
          '--codec',
          'h264',
          '--worktree',
          'folder:mobile',
          '--timeout-ms',
          '50'
        ],
        dir
      )
      expect(process.exitCode).toBeUndefined()
      expect(output).toHaveBeenLastCalledWith(expect.stringContaining('duration'))
      expect(scrcpyVideoRegistry.has(deviceId)).toBe(true)
      await main(
        ['emulator', 'key', 'ArrowLeft', '--shift', '--worktree', 'folder:mobile', '--json'],
        dir
      )
      expect(process.exitCode).toBeUndefined()
      await main(
        [
          'emulator',
          'control',
          '--text',
          JSON.stringify([
            { type: 'touch', phase: 'begin', x: 0.2, y: 0.3 },
            { type: 'wait', ms: 25 },
            { type: 'touch', phase: 'move', x: 0.4, y: 0.6 },
            { type: 'blur' }
          ]),
          '--worktree',
          'folder:mobile',
          '--json'
        ],
        dir
      )
      expect(process.exitCode).toBeUndefined()
      expect(controlFrames).toEqual([
        { tag: 6, frame: { type: 'down', usage: 225 } },
        { tag: 6, frame: { type: 'down', usage: 80 } },
        { tag: 6, frame: { type: 'up', usage: 80 } },
        { tag: 6, frame: { type: 'up', usage: 225 } },
        { tag: 3, frame: { type: 'begin', x: 0.2, y: 0.3 } },
        { tag: 3, frame: { type: 'move', x: 0.4, y: 0.6 } },
        { tag: 3, frame: { type: 'end', x: 0.4, y: 0.6 } }
      ])
      await main(['emulator', 'detach', '--worktree', 'folder:mobile', '--json'], dir)
      expect(process.exitCode).toBeUndefined()
      expect(bridge.getActiveForWorktree('folder:mobile')).toBeNull()
      expect(scrcpyVideoRegistry.has(deviceId)).toBe(true)
      expect(seen).toEqual([
        'emulator.type',
        'emulator.observe',
        'emulator.startVideoStream',
        'emulator.control',
        'emulator.control',
        'emulator.unregisterActive'
      ])
      expect(JSON.stringify(output.mock.calls)).not.toContain('fixture input')
    } finally {
      for (const socket of controlServer.clients) {
        socket.terminate()
      }
      await new Promise<void>((resolve) => controlServer.close(() => resolve()))
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
      await rm(dir, { recursive: true, force: true })
    }
  })
})
