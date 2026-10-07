import {
  FixtureSpeechModelManager,
  installTinySpeechManifest
} from './speech-model-download.fixture'
import { attachVoiceMicrophoneOwner } from '../../src/renderer/src/runtime/voice-microphone-owner'
import { listVoiceMicrophoneDevices } from '../../src/renderer/src/components/dictation/microphone-devices'
import { attachVoiceKeyDraftRequest } from '../../src/renderer/src/runtime/voice-key-draft-request'
import { attachVmCleanupConfirmRequest } from '../../src/renderer/src/runtime/vm-cleanup-confirm-request'
import { attachVoiceModelDeleteRequest } from '../../src/renderer/src/runtime/voice-model-delete-request'
import type { VoiceSettings } from '../../src/shared/speech-types'
import { VOICE_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/voice-viewer'
import { VOICE_VIEWER_HANDLERS } from '../../src/cli/handlers/voice-viewer'
import { VOICE_VIEWER_COMMAND_SPECS } from '../../src/cli/specs/voice-viewer'
import { applyVoiceViewerRequest } from '../../src/renderer/src/runtime/voice-viewer-bridge'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import type * as NodeOs from 'node:os'
import { Readable } from 'node:stream'
import { z } from 'zod'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { Store } from '../../src/main/persistence'
import { initializeEphemeralVmOperations } from '../../src/main/ephemeral-vm-operations'
import { setEphemeralVmDesktopService } from '../../src/main/ephemeral-vm-desktop-service'
import { EPHEMERAL_VM_METHODS } from '../../src/main/runtime/rpc/methods/ephemeral-vm'
import { SPEECH_TRANSCRIPTION_METHODS } from '../../src/main/runtime/rpc/methods/speech-transcription'
import { SPEECH_TRANSCRIPTION_HANDLERS } from '../../src/cli/handlers/speech-transcription'
import { SPEECH_TRANSCRIPTION_COMMAND_SPECS } from '../../src/cli/specs/speech-transcription'
import type { SttEventSink } from '../../src/main/speech/stt-service'
import { SPEECH_METHODS } from '../../src/main/runtime/rpc/methods/speech'
import { SPEECH_CONTROL_METHODS } from '../../src/main/runtime/rpc/methods/speech-control'
import { upsertEphemeralVmRuntime } from '../../src/shared/ephemeral-vm-runtime-store'
import { SttService } from '../../src/main/speech/stt-service'
import { setSpeechServiceFactories } from '../../src/main/speech/speech-runtime-service'
import { setSecretStore, _resetSecretStoreForTests } from '../../src/shared/secret-store'
import { clearOpenAiSpeechApiKey } from '../../src/main/speech/openai-api-key-store'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { SPEECH_HANDLERS } from '../../src/cli/handlers/speech'
import { VM_LIFECYCLE_HANDLERS } from '../../src/cli/handlers/vm-lifecycle'
import { SPEECH_COMMAND_SPECS } from '../../src/cli/specs/speech'
import { VM_LIFECYCLE_COMMAND_SPECS } from '../../src/cli/specs/vm-lifecycle'

const viewerFixture = vi.hoisted(() => ({ getState: () => ({}) }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => viewerFixture.getState() } }))

const fixtureHome = vi.hoisted(() => ({ path: '' }))
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeOs>()
  return { ...actual, homedir: () => fixtureHome.path || actual.homedir() }
})

vi.mock('../../src/main/ephemeral-vm-runtime-ssh', () => ({
  connectRuntimeOwnedSshTarget: vi.fn(async () => ({ targetId: 'fixture-ssh-target' })),
  disconnectRuntimeOwnedSshTarget: vi.fn(async () => {}),
  removeRuntimeOwnedSshTarget: vi.fn(async () => {})
}))
vi.mock('../../src/main/ipc/runtime-environments', () => ({
  invalidateRuntimeEnvironmentTransport: vi.fn()
}))
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: vi.fn(() => {
    throw new Error('Fixture must never launch an app')
  })
}))

const roots: string[] = []
afterEach(() => {
  if (fixtureHome.path) {
    clearOpenAiSpeechApiKey()
  }
  fixtureHome.path = ''
  _resetSecretStoreForTests()
  setSpeechServiceFactories(null)
  setEphemeralVmDesktopService(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe.skipIf(process.platform === 'win32')('speech and VM CLI socket effects', () => {
  it('parses commands through the socket dispatcher and reads back speech cancellation and VM attachment', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-tools-'))
    roots.push(root)
    fixtureHome.path = root
    setSecretStore({
      isEncryptionAvailable: () => true,
      encryptString: (text) => Buffer.from(`sealed:${text}`),
      decryptString: (buffer) => buffer.toString().slice(7),
      describeProtectionGap: () => null
    })
    const providerScript = join(root, 'fixture-provider.cjs')
    writeFileSync(
      providerScript,
      `const fs = require('node:fs');
const mode = process.env.ORCA_VM_MODE;
fs.writeFileSync('fixture-provider-state', mode);
if (mode === 'create' || mode === 'resume') console.log(JSON.stringify({ schemaVersion: 1, connection: { type: 'ssh', target: { label: 'Fixture', host: 'fixture.invalid', port: 22, username: 'fixture' }, projectRoot: process.cwd() } }));
`
    )
    const command = `"${process.execPath}" "${providerScript}"`
    writeFileSync(
      join(root, 'orca.yaml'),
      [
        'environmentRecipes:',
        '  - id: fixture-provider',
        '    name: Fixture Provider',
        ...['create', 'destroy', 'suspend', 'resume'].map(
          (action) => `    ${action}: ${JSON.stringify(command)}`
        )
      ].join('\n')
    )
    const store = new Store({
      serializedState: JSON.stringify({
        repos: [
          { id: 'fixture-repo', path: root, displayName: 'Fixture', badgeColor: '#000', addedAt: 1 }
        ],
        settings: {
          experimentalEphemeralVms: true,
          voice: { enabled: true, sttModel: 'whisper-tiny', dictationMode: 'toggle' }
        }
      }),
      dataFile: join(root, 'profile.json')
    })
    const runtime = new OrcaRuntimeService(store)
    viewerFixture.getState = () => ({
      persistedUIReady: true,
      openSettingsTarget: () => {},
      openSettingsPage: () => {},
      settings: store.getSettings(),
      updateSettingsOrThrow: async (updates: { voice: VoiceSettings }) => {
        store.updateSettings(updates)
      }
    })
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'socket-mic', label: 'Socket Mic' }
        ]
      }
    })
    vi.stubGlobal('window', { api: { settings: { get: async () => store.getSettings() } } })
    const detachMicrophone = attachVoiceMicrophoneOwner({
      refresh: async () =>
        listVoiceMicrophoneDevices(await navigator.mediaDevices.enumerateDevices()),
      select: async (id) => {
        store.updateSettings({
          voice: {
            ...store.getSettings().voice,
            microphoneDeviceId: id,
            microphoneDeviceLabel: 'Socket Mic'
          }
        })
        return { deviceId: id, label: 'Socket Mic' }
      },
      access: async () => true
    })
    let draft = ''
    let confirmRuntime: string | null = null
    let deleteModelId = ''
    let finishDelete: (() => void) | undefined
    const detachDraft = attachVoiceKeyDraftRequest((value) => {
      draft = value
      return true
    })
    const detachConfirm = attachVmCleanupConfirmRequest((request) => {
      if (request.runtimeId !== 'fixture-vm') {
        return false
      }
      confirmRuntime = request.operation === 'open' ? request.runtimeId : null
      return true
    })
    const detachDelete = attachVoiceModelDeleteRequest(async (modelId) => {
      deleteModelId = modelId
      await new Promise<void>((resolve) => {
        finishDelete = resolve
      })
      deleteModelId = ''
    })
    vi.stubGlobal('document', {
      querySelector: (selector: string) => (selector.includes('input') ? { value: draft } : {}),
      querySelectorAll: (selector: string) => {
        const value = selector.includes('cleanup-confirm')
          ? confirmRuntime
          : JSON.stringify([deleteModelId])
        return value ? [{ getAttribute: () => value }] : []
      }
    })
    runtime.setNotifier({
      voiceViewer: async (command) => ({
        ...(await applyVoiceViewerRequest({
          id: 'socket-viewer',
          expiresAt: Date.now() + 1000,
          command
        })),
        viewerId: 7
      })
    })
    installTinySpeechManifest('whisper-tiny')
    const manager = new FixtureSpeechModelManager(join(root, 'models'))
    let downloadStatus: 'downloading' | 'not-downloaded' = 'downloading'
    vi.spyOn(manager, 'cancelDownload').mockImplementation(() => {
      downloadStatus = 'not-downloaded'
    })
    vi.spyOn(manager, 'getModelStates').mockImplementation(async () => [
      { id: 'whisper-tiny', status: downloadStatus }
    ])
    const stt = new SttService(manager)
    let sink: SttEventSink | undefined
    const lifecycle: string[] = []
    vi.spyOn(manager, 'getModelState').mockResolvedValue({ id: 'whisper-tiny', status: 'ready' })
    vi.spyOn(stt, 'startDictation').mockImplementation(async (_model, callback) => {
      lifecycle.push('start')
      sink = callback
      callback({ type: 'ready' })
    })
    vi.spyOn(stt, 'feedAudio').mockImplementation((samples) => {
      lifecycle.push('audio')
      expect(samples[0]).toBe(0.5)
      if (!sink) {
        throw new Error('Missing speech event sink')
      }
      sink({ type: 'partial', text: 'fixture partial' })
    })
    vi.spyOn(stt, 'stopDictation').mockImplementation(async () => {
      lifecycle.push('stop')
      if (!sink) {
        throw new Error('Missing speech event sink')
      }
      sink({ type: 'final', text: 'fixture final' })
      sink({ type: 'stopped' })
    })
    setSpeechServiceFactories({ createModelManager: () => manager, createSttService: () => stt })
    initializeEphemeralVmOperations(store, root)
    upsertEphemeralVmRuntime(root, {
      id: 'fixture-vm',
      recipeId: 'fixture',
      status: 'running',
      cleanupStatus: 'not_started',
      createdAt: 1,
      updatedAt: 1,
      recipeResult: { schemaVersion: 1, pairingCode: 'fixture-secret', projectRoot: root }
    })
    const dispatcher = new RpcDispatcher({
      runtime,
      methods: [
        ...SPEECH_METHODS,
        ...SPEECH_CONTROL_METHODS,
        ...SPEECH_TRANSCRIPTION_METHODS,
        ...EPHEMERAL_VM_METHODS,
        ...VOICE_VIEWER_METHODS
      ]
    })
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
    const specs = [
      ...SPEECH_COMMAND_SPECS,
      ...SPEECH_TRANSCRIPTION_COMMAND_SPECS,
      ...VM_LIFECYCLE_COMMAND_SPECS,
      ...VOICE_VIEWER_COMMAND_SPECS
    ]
    const handlers = {
      ...SPEECH_HANDLERS,
      ...SPEECH_TRANSCRIPTION_HANDLERS,
      ...VM_LIFECYCLE_HANDLERS,
      ...VOICE_VIEWER_HANDLERS
    }
    async function invoke(argv: string[]) {
      const parsed = parseArgs(
        argv,
        specs.map((spec) => spec.path),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      const handler = handlers[parsed.commandPath.join(' ')]
      if (!handler) {
        throw new Error('Missing fixture command')
      }
      await handler({ client, flags: parsed.flags, cwd: root, json: true })
    }
    try {
      await invoke(['speech', 'viewer', '--viewer', 'host', '--operation', 'microphones-list'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('Socket Mic')
      await invoke([
        'speech',
        'viewer',
        '--viewer',
        'host',
        '--operation',
        'microphone-select',
        '--device',
        'socket-mic'
      ])
      expect(store.getSettings().voice?.microphoneDeviceId).toBe('socket-mic')
      expect(output.mock.calls.at(-1)?.[0]).toContain('"persisted": true')
      await invoke(['speech', 'setup', '--enabled', 'false', '--mode', 'hold'])
      expect(store.getSettings().voice?.enabled).toBe(false)
      expect(store.getSettings().voice?.dictationMode).toBe('hold')
      await invoke([
        'speech',
        'setup',
        '--enabled',
        'true',
        '--mode',
        'toggle',
        '--model',
        'whisper-tiny'
      ])
      expect(store.getSettings().voice?.enabled).toBe(true)
      await invoke(['speech', 'models', 'cancel', '--model', 'whisper-tiny'])
      await invoke(['speech', 'models', 'list'])
      expect(manager.cancelDownload).toHaveBeenCalledWith('whisper-tiny')
      expect(output.mock.calls.at(-1)?.[0]).toContain('not-downloaded')
      const audioFile = join(root, 'audio.pcm')
      const audio = Buffer.alloc(4)
      audio.writeInt16LE(16384, 0)
      writeFileSync(audioFile, audio)
      await invoke(['speech', 'dictation', 'transcribe', '--audio-file', audioFile])
      expect(lifecycle).toEqual(['start', 'audio', 'stop'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('fixture final')
      expect(output.mock.calls.at(-1)?.[0]).toContain('fixture partial')
      vi.mocked(stt.feedAudio).mockImplementationOnce(() => {
        throw new Error('fixture_audio_failed')
      })
      vi.mocked(stt.stopDictation).mockRejectedValueOnce(new Error('fixture_cleanup_failed'))
      await expect(
        invoke(['speech', 'dictation', 'transcribe', '--audio-file', audioFile])
      ).rejects.toThrow('fixture_audio_failed')
      await invoke(['speech', 'dictation', 'transcribe', '--audio-file', audioFile])
      expect(output.mock.calls.at(-1)?.[0]).toContain('fixture final')
      const keyFile = join(root, 'key-input')
      writeFileSync(keyFile, 'fixture-api-key-private')
      await invoke([
        'speech',
        'viewer',
        '--viewer',
        'host',
        '--operation',
        'key-draft',
        '--input-file',
        keyFile
      ])
      expect(draft).toBe('fixture-api-key-private')
      expect(output.mock.calls.at(-1)?.[0]).toContain('"draftPresent": true')
      await invoke(['speech', 'viewer', '--viewer', 'host', '--operation', 'key-draft-clear'])
      expect(draft).toBe('')
      await expect(
        invoke([
          'speech',
          'viewer',
          '--viewer',
          'host',
          '--operation',
          'key-draft',
          '--api-key',
          'forbidden'
        ])
      ).rejects.toThrow('Unknown flag')
      await invoke(['speech', 'key', 'save', '--input-file', keyFile])
      await invoke(['speech', 'key', 'status'])
      expect(store.getSettings().voice?.openAiApiKeyConfigured).toBe(true)
      expect(output.mock.calls.at(-1)?.[0]).toContain('"configured": true')
      const stdin = vi
        .spyOn(process.stdin, Symbol.asyncIterator)
        .mockImplementation(() =>
          Readable.from([Buffer.from('fixture-stdin-key-private')])[Symbol.asyncIterator]()
        )
      await invoke(['speech', 'key', 'save', '--input-file', '-'])
      stdin.mockRestore()
      expect(JSON.stringify(output.mock.calls)).not.toContain('fixture-api-key-private')
      expect(JSON.stringify(output.mock.calls)).not.toContain('fixture-stdin-key-private')
      await invoke(['speech', 'key', 'clear'])
      await invoke(['speech', 'key', 'status'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('"configured": false')
      expect(store.getSettings().voice?.openAiApiKeyConfigured).toBe(false)
      expect(() =>
        parseArgs(
          ['speech', 'key', 'save', '--api-key', 'forbidden'],
          specs.map((spec) => spec.path),
          specs
        )
      ).not.toThrow()
      await expect(invoke(['speech', 'key', 'save', '--api-key', 'forbidden'])).rejects.toThrow(
        'Unknown flag'
      )
      await expect(
        invoke(['vm', 'stop-cleanup', '--runtime', 'fixture-vm', '--confirm', 'wrong'])
      ).rejects.toThrow('--confirm')
      await expect(
        invoke(['speech', 'models', 'rm', '--model', 'whisper-tiny', '--confirm', 'wrong'])
      ).rejects.toThrow('--confirm')
      vi.mocked(manager.getModelStates).mockRestore()
      vi.mocked(manager.getModelState).mockRestore()
      await invoke(['speech', 'models', 'download', '--model', 'whisper-tiny'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('"started": true')
      expect(await manager.getModelState('whisper-tiny')).toMatchObject({ status: 'downloading' })
      expect(existsSync(`${manager.getModelDir('whisper-tiny')}.partial`)).toBe(true)
      manager.release()
      await vi.waitFor(async () =>
        expect(await manager.getModelState('whisper-tiny')).toMatchObject({ status: 'ready' })
      )
      expect(manager.receivedFiles.length).toBeGreaterThan(0)
      for (const file of manager.receivedFiles) {
        expect(file).toContain('.partial')
        expect(readFileSync(file.replace('.partial', ''), 'utf8')).toBe('fixture model bytes')
      }
      expect(existsSync(`${manager.getModelDir('whisper-tiny')}.partial`)).toBe(false)
      await invoke(['speech', 'models', 'list'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('"status": "ready"')
      expect(store.getSettings().voice?.sttModel).toBe('whisper-tiny')
      await invoke([
        'speech',
        'models',
        'rm',
        '--model',
        'whisper-tiny',
        '--confirm',
        'whisper-tiny'
      ])
      expect(existsSync(manager.getModelDir('whisper-tiny'))).toBe(false)
      expect(store.getSettings().voice?.sttModel).toBe('')
      expect(await manager.getModelState('whisper-tiny')).toMatchObject({
        status: 'not-downloaded'
      })
      await invoke([
        'speech',
        'viewer',
        '--viewer',
        'host',
        '--operation',
        'vm-stop-confirm-open',
        '--runtime',
        'fixture-vm'
      ])
      expect(confirmRuntime).toBe('fixture-vm')
      await invoke([
        'speech',
        'viewer',
        '--viewer',
        'host',
        '--operation',
        'vm-stop-confirm-cancel',
        '--runtime',
        'fixture-vm'
      ])
      expect(confirmRuntime).toBeNull()
      await invoke([
        'speech',
        'viewer',
        '--viewer',
        'host',
        '--operation',
        'model-delete-start',
        '--model',
        'whisper-tiny',
        '--confirm',
        'whisper-tiny'
      ])
      expect(deleteModelId).toBe('whisper-tiny')
      const deletion = z
        .object({
          result: z.object({ operationId: z.string(), deleteState: z.literal('pending') })
        })
        .parse(JSON.parse(output.mock.calls.at(-1)?.[0]))
      if (!finishDelete) {
        throw new Error('Missing deletion fixture')
      }
      finishDelete()
      await invoke([
        'speech',
        'viewer',
        '--viewer',
        'host',
        '--operation',
        'model-delete-status',
        '--operation-id',
        deletion.result.operationId
      ])
      expect(output.mock.calls.at(-1)?.[0]).toContain('succeeded')
      expect(deleteModelId).toBe('')
      await invoke(['vm', 'recipes', '--repo', 'fixture-repo'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('fixture-provider')
      expect(output.mock.calls.at(-1)?.[0]).not.toContain(providerScript)
      await invoke(['vm', 'catalog'])
      expect(output.mock.calls.at(-1)?.[0]).not.toContain(providerScript)
      await invoke(['vm', 'doctor', '--repo', 'fixture-repo', '--recipe', 'fixture-provider'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('"ok": true')
      expect(output.mock.calls.at(-1)?.[0]).not.toContain(process.execPath)
      await invoke([
        'vm',
        'provision',
        '--repo',
        'fixture-repo',
        '--recipe',
        'fixture-provider',
        '--provision-id',
        'fixture-provision',
        '--workspace',
        'provider-workspace'
      ])
      const provisionOutput = output.mock.calls.at(-1)?.[0]
      if (typeof provisionOutput !== 'string') {
        throw new Error('Missing provision response')
      }
      const provision = z
        .object({
          result: z.object({ ok: z.literal(true), runtime: z.object({ id: z.string() }) })
        })
        .parse(JSON.parse(provisionOutput))
      expect(readFileSync(join(root, 'fixture-provider-state'), 'utf8')).toBe('create')
      await invoke(['vm', 'provision-status', '--provision-id', 'fixture-provision'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('succeeded')
      expect(output.mock.calls.at(-1)?.[0]).not.toContain('fixture.invalid')
      await invoke(['vm', 'suspend', '--workspace', 'provider-workspace'])
      expect(readFileSync(join(root, 'fixture-provider-state'), 'utf8')).toBe('suspend')
      expect(output.mock.calls.at(-1)?.[0]).toContain('suspended')
      await invoke(['vm', 'resume', '--workspace', 'provider-workspace'])
      expect(readFileSync(join(root, 'fixture-provider-state'), 'utf8')).toBe('resume')
      const cleanupFile = join(root, 'cleanup-private.json')
      await invoke([
        'vm',
        'cleanup-command',
        '--runtime',
        provision.result.runtime.id,
        '--output-file',
        cleanupFile
      ])
      expect(readFileSync(cleanupFile, 'utf8')).toContain('payloadJson')
      await invoke(['vm', 'cleanup', '--runtime', provision.result.runtime.id])
      expect(readFileSync(join(root, 'fixture-provider-state'), 'utf8')).toBe('destroy')
      expect(output.mock.calls.at(-1)?.[0]).toContain('succeeded')
      const failureScript = join(root, 'failure-provider.cjs')
      writeFileSync(
        failureScript,
        'console.log("fixture-provider-private");console.error("fixture-provider-private");process.exit(1)'
      )
      writeFileSync(
        join(root, 'orca.yaml'),
        `environmentRecipes:\n  - id: failure-provider\n    name: Failure Provider\n    create: ${JSON.stringify(`"${process.execPath}" "${failureScript}"`)}\n    destroy: none\n`
      )
      await invoke(['vm', 'doctor', '--repo', 'fixture-repo', '--recipe', 'failure-provider'])
      expect(output.mock.calls.at(-1)?.[0]).not.toContain(failureScript)
      await expect(
        invoke([
          'vm',
          'provision',
          '--repo',
          'fixture-repo',
          '--recipe',
          'failure-provider',
          '--provision-id',
          'fixture-failure'
        ])
      ).rejects.toThrow('VM provisioning failed')
      await invoke(['vm', 'provision-status', '--provision-id', 'fixture-failure'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('failed')
      expect(JSON.stringify(output.mock.calls)).not.toContain('fixture-provider-private')
      await invoke(['vm', 'attach', '--runtime', 'fixture-vm', '--workspace', 'fixture-workspace'])
      await invoke(['vm', 'runtimes'])
      expect(output.mock.calls.at(-1)?.[0]).toContain('fixture-workspace')
      expect(JSON.stringify(output.mock.calls)).not.toContain('fixture-secret')
      expect(readFileSync(join(root, 'orca-ephemeral-vm-runtimes.json'), 'utf8')).toContain(
        'fixture-workspace'
      )
    } finally {
      detachMicrophone()
      detachDraft()
      detachConfirm()
      detachDelete()
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
