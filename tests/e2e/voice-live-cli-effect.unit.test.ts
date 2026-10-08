// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createServer, type Socket } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DictationState } from '../../src/shared/speech-types'
import { DictationController } from '../../src/renderer/src/components/dictation/DictationController'
import { applyVoiceViewerRequest } from '../../src/renderer/src/runtime/voice-viewer-bridge'
import { VOICE_VIEWER_COMMAND_SPECS } from '../../src/cli/specs/voice-viewer'
import { VOICE_VIEWER_HANDLERS } from '../../src/cli/handlers/voice-viewer'
import { VOICE_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/voice-viewer'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { Store } from '../../src/main/persistence'

const fixture = vi.hoisted(() => ({
  getState: () => ({}),
  capture: vi.fn(),
  stopCapture: vi.fn(),
  flush: vi.fn(),
  discard: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (state: object) => unknown) => select(fixture.getState()), {
    getState: () => fixture.getState()
  })
}))
vi.mock('@/hooks/use-audio-capture', () => ({
  useAudioCapture: () => ({
    start: fixture.capture,
    stop: fixture.stopCapture,
    flushBufferedAudio: fixture.flush,
    discardBufferedAudio: fixture.discard,
    getCapturedChunkCount: () => 1
  })
}))
vi.mock('../../src/renderer/src/components/dictation/DictationIndicator', () => ({
  DictationIndicator: () => null
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), message: vi.fn() }) }))

let uiRoot: Root | undefined
const roots: string[] = []
afterEach(async () => {
  await act(async () => uiRoot?.unmount())
  uiRoot = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe.skipIf(process.platform === 'win32')('live voice CLI owner effects', () => {
  it('uses the socket and existing controller to start, insert, stop and cancel a pending fake capture', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const root = mkdtempSync(join(tmpdir(), 'orca-live-voice-'))
    roots.push(root)
    const store = new Store({
      serializedState: JSON.stringify({
        settings: { voice: { enabled: true, sttModel: 'whisper-tiny', dictationMode: 'toggle' } }
      }),
      dataFile: join(root, 'profile.json')
    })
    let state: DictationState = 'idle'
    let partial = ''
    fixture.getState = () => ({
      persistedUIReady: true,
      settings: store.getSettings(),
      dictationState: state,
      setDictationState: (value: DictationState) => {
        state = value
      },
      setPartialTranscript: (text: string) => {
        partial = text
      },
      recordFeatureInteraction: () => {},
      keybindings: {}
    })
    type Transcript = { sessionId: string; text: string }
    let onPartial: ((data: Transcript) => void) | undefined
    let onFinal: ((data: Transcript) => void) | undefined
    let onStopped: ((data: { sessionId: string }) => void) | undefined
    let sessionId = ''
    const lifecycle: string[] = []
    const start = vi.fn(async (_model: string, _language: unknown, id: string) => {
      sessionId = id
      lifecycle.push('engine-start')
    })
    const stop = vi.fn(async (id: string) => {
      lifecycle.push('engine-stop')
      onFinal?.({ sessionId: id, text: 'fixture final' })
      onStopped?.({ sessionId: id })
    })
    Object.assign(window, {
      api: {
        ui: { onDictationKeyDown: () => () => {} },
        speech: {
          startDictation: start,
          stopDictation: stop,
          onPartialTranscript: (receive: typeof onPartial) => {
            onPartial = receive
            return () => {
              onPartial = undefined
            }
          },
          onFinalTranscript: (receive: typeof onFinal) => {
            onFinal = receive
            return () => {
              onFinal = undefined
            }
          },
          onStopped: (receive: typeof onStopped) => {
            onStopped = receive
            return () => {
              onStopped = undefined
            }
          },
          onError: () => () => {}
        }
      }
    })
    fixture.capture.mockImplementation(async () => {
      lifecycle.push('capture-start')
      return {}
    })
    fixture.stopCapture.mockImplementation(() => {
      lifecycle.push('capture-stop')
    })
    fixture.flush.mockImplementation(async () => {
      lifecycle.push('audio-flush')
      onPartial?.({ sessionId, text: 'fixture partial' })
    })
    fixture.discard.mockReset()
    const element = document.createElement('textarea')
    document.body.appendChild(element)
    element.focus()
    const container = document.createElement('div')
    document.body.appendChild(container)
    uiRoot = createRoot(container)
    await act(async () => uiRoot?.render(createElement(DictationController)))
    const runtime = new OrcaRuntimeService(store)
    runtime.setNotifier({
      voiceViewer: async (command) => ({
        ...(await applyVoiceViewerRequest({
          id: 'live-fixture',
          command,
          expiresAt: Date.now() + 1000
        })),
        viewerId: 9
      })
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: VOICE_VIEWER_METHODS })
    const sockets = new Set<Socket>()
    const server = createServer((socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      let pending = ''
      socket.on('data', (chunk) => {
        pending += chunk.toString()
        const boundary = pending.indexOf('\n')
        if (boundary === -1) {
          return
        }
        const request = JSON.parse(pending.slice(0, boundary))
        pending = pending.slice(boundary + 1)
        if (request.authToken !== 'fixture-token') {
          socket.destroy()
          return
        }
        void dispatcher
          .dispatch(request)
          .then((response) => socket.write(`${JSON.stringify(response)}\n`))
      })
    })
    const endpoint = join(root, 'runtime.sock')
    await new Promise<void>((resolve) => server.listen(endpoint, resolve))
    writeFileSync(
      join(root, 'orca-runtime.json'),
      JSON.stringify({
        runtimeId: runtime.getRuntimeId(),
        pid: process.pid,
        transports: [{ kind: 'unix', endpoint }],
        authToken: 'fixture-token',
        startedAt: 1
      })
    )
    const client = new RuntimeClient(root, 5000, null, null)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    async function invoke(operation: string, operationId?: string) {
      const argv = [
        'speech',
        'viewer',
        '--viewer',
        'host',
        '--operation',
        operation,
        ...(operationId ? ['--operation-id', operationId] : [])
      ]
      const parsed = parseArgs(
        argv,
        VOICE_VIEWER_COMMAND_SPECS.map((spec) => spec.path),
        VOICE_VIEWER_COMMAND_SPECS
      )
      validateCommandAndFlags(VOICE_VIEWER_COMMAND_SPECS, parsed)
      const handler = VOICE_VIEWER_HANDLERS['speech viewer']
      if (!handler) {
        throw new Error('Missing voice handler')
      }
      await handler({ client, flags: parsed.flags, cwd: root, json: true })
    }
    try {
      await invoke('dictation-start')
      expect(state).toBe('listening')
      expect(partial).toBe('fixture partial')
      expect(lifecycle).toEqual(['capture-start', 'engine-start', 'audio-flush'])
      await invoke('dictation-status', sessionId)
      expect(output.mock.calls.at(-1)?.[0]).toContain('"targetCaptured": true')
      await expect(invoke('dictation-cancel', 'wrong')).rejects.toThrow('operation_mismatch')
      await invoke('dictation-stop', sessionId)
      expect(state).toBe('idle')
      await vi.waitFor(() => expect(element.value).toBe('fixture final'))
      expect(JSON.stringify(output.mock.calls)).not.toContain('fixture final')
      element.value = ''
      element.focus()
      await invoke('dictation-toggle')
      await invoke('dictation-cancel', sessionId)
      expect(state).toBe('idle')
      expect(element.value).toBe('')
      expect(output.mock.calls.at(-1)?.[0]).toContain('"cancellationRequested": true')
      let grant: (() => void) | undefined
      fixture.capture.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            grant = resolve
          })
      )
      await invoke('dictation-start')
      expect(state).toBe('starting')
      const pendingId = String(Number(sessionId) + 1)
      await invoke('dictation-cancel', pendingId)
      expect(state).toBe('stopping')
      await expect(invoke('dictation-start')).rejects.toThrow('busy')
      expect(output.mock.calls.at(-1)?.[0]).toContain('"osPromptDismissed": false')
      const count = start.mock.calls.length
      if (!grant) {
        throw new Error('Missing permission fixture')
      }
      await act(async () => grant?.())
      expect(state).toBe('idle')
      expect(start).toHaveBeenCalledTimes(count)
      expect(element.value).toBe('')
      expect(fixture.discard).toHaveBeenCalled()
      element.blur()
      await expect(invoke('dictation-start')).rejects.toThrow('insertion_target_missing')
    } finally {
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
