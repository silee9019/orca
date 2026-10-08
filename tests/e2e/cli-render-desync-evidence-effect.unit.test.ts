import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { createRuntime } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { STATUS_METHODS } from '../../src/main/runtime/rpc/methods/status'
import { TERMINAL_RENDER_EVIDENCE_METHODS } from '../../src/main/runtime/rpc/methods/terminal-render-evidence'
import * as appEnvironment from '../../src/shared/app-environment'
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII='
it.each(
  [
    'local',
    'paired',
    'old-local',
    'old-paired',
    'wrong-owner',
    'invalid-png',
    'metadata-limit',
    'overwrite',
    'symlink',
    'retention'
  ].filter((mode) => process.platform !== 'win32' || mode !== 'symlink')
)('writes supplied private evidence through the selected host: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-render-evidence-')),
    runtime = createRuntime(),
    paired = mode.includes('paired'),
    old = mode.startsWith('old')
  const original = appEnvironment.getAppEnvironment()
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    ...original,
    getPath: (name) => (name === 'userData' ? root : original.getPath(name))
  })
  vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
  const server = new OrcaRuntimeRpcServer({
    runtime,
    userDataPath: root,
    enableWebSocket: paired,
    wsPort: 0,
    pinnedBindHost: '127.0.0.1',
    methods: [...STATUS_METHODS, ...(old ? [] : TERMINAL_RENDER_EVIDENCE_METHODS)]
  })
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const evidence = join(root, 'terminal-render-desync-evidence'),
    captureId = randomUUID(),
    file = join(root, 'request.json')
  const request = {
    expectedRuntimeId: mode === 'wrong-owner' ? 'other' : runtime.getRuntimeId(),
    executionHostId: 'local',
    captureId,
    phase: 'corrupt',
    source: 'cli-supplied',
    confirm: true,
    includeContent: true,
    pngDataUrl:
      mode === 'invalid-png' ? 'data:image/png;base64,eA==' : `data:image/png;base64,${PNG}`,
    metadata: {
      bufferText: mode === 'metadata-limit' ? 'x'.repeat(256 * 1024) : 'private render canary'
    }
  }
  async function write(value: unknown) {
    await import('node:fs/promises').then((fs) => fs.writeFile(file, JSON.stringify(value)))
    process.exitCode = undefined
    await main(['terminal', 'write-render-evidence', '--request-file', file, '--json'], root)
    return JSON.parse(String(output.mock.calls.at(-1)?.[0]))
  }
  try {
    await server.start()
    if (paired) {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'isolated-render-evidence',
        scope: 'runtime'
      })
      if (!offer.available) {
        throw new Error('Fixture pairing unavailable')
      }
      vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
      await rm(join(root, 'orca-runtime.json'))
    }
    if (mode === 'symlink') {
      const outside = join(root, 'outside')
      await mkdir(outside)
      await mkdir(evidence)
      await symlink(outside, join(evidence, `cli-${captureId}`), 'dir')
    }
    const response = await write(request)
    if (old || ['wrong-owner', 'invalid-png', 'metadata-limit', 'symlink'].includes(mode)) {
      expect(process.exitCode).toBe(1)
      expect(response.ok).toBe(false)
      if (old) {
        expect(response.error.code).toBe('method_not_found')
      }
      if (mode === 'symlink') {
        expect(await readdir(join(root, 'outside'))).toEqual([])
      } else {
        expect(
          await stat(evidence).then(
            () => true,
            () => false
          )
        ).toBe(false)
      }
      return
    }
    expect(process.exitCode).toBeUndefined()
    expect(response.result).toMatchObject({
      written: true,
      rendererCaptureVerified: false,
      source: 'cli-supplied',
      captureId
    })
    const directory = join(evidence, `cli-${captureId}`),
      png = await readFile(join(directory, 'corrupt.png')),
      metadata = await readFile(join(directory, 'corrupt.json'))
    expect(png.equals(Buffer.from(PNG, 'base64'))).toBe(true)
    expect(response.result.pngSha256).toBe(createHash('sha256').update(png).digest('hex'))
    expect(response.result.metadataSha256).toBe(createHash('sha256').update(metadata).digest('hex'))
    expect(JSON.parse(metadata.toString()).cliSource).toEqual({
      runtimeId: runtime.getRuntimeId(),
      captureId,
      source: 'cli-supplied'
    })
    if (process.platform !== 'win32') {
      expect((await stat(directory)).mode & 0o777).toBe(0o700)
      expect((await stat(join(directory, 'corrupt.png'))).mode & 0o777).toBe(0o600)
    }
    if (mode === 'overwrite') {
      await write(request)
      expect(process.exitCode).toBe(1)
      expect(await readFile(join(directory, 'corrupt.png'))).toEqual(png)
    } else {
      const healed = await write({ ...request, phase: 'healed' })
      expect(process.exitCode).toBeUndefined()
      expect(healed.result.phase).toBe('healed')
    }
    if (mode === 'retention') {
      const start = Date.now() - 60_000
      await utimes(directory, new Date(start), new Date(start))
      const ids = []
      for (let index = 1; index <= 5; index++) {
        const id = randomUUID()
        ids.push(`cli-${id}`)
        await write({ ...request, captureId: id })
        expect(process.exitCode).toBeUndefined()
        await utimes(
          join(evidence, `cli-${id}`),
          new Date(start + index * 5000),
          new Date(start + index * 5000)
        )
      }
      expect((await readdir(evidence)).sort()).toEqual(ids.slice(-4).sort())
    }
    expect(JSON.stringify(output.mock.calls)).not.toContain('private render canary')
    expect(JSON.stringify(output.mock.calls)).not.toContain(PNG)
  } finally {
    await server.stop()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
