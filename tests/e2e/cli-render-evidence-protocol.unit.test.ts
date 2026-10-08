import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { RuntimeClient } from '../../src/cli/runtime/client'
import { terminalRenderEvidenceMetadata } from '../../src/shared/rpc-contract/terminal-render-evidence-params'
it.each([
  'capture',
  'runtime',
  'phase',
  'png-hash',
  'metadata-hash',
  'private-field',
  'renderer-proof',
  'host-path'
])('rejects hostile render evidence receipts: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-render-protocol-'))
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const request = {
    expectedRuntimeId: 'fixture',
    executionHostId: 'local' as const,
    captureId: '11111111-1111-4111-8111-111111111111',
    phase: 'corrupt' as const,
    source: 'cli-supplied' as const,
    confirm: true as const,
    includeContent: true as const,
    pngDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    metadata: { text: 'private-unrequested-fixture' }
  }
  const response = {
    expectedRuntimeId: request.expectedRuntimeId,
    executionHostId: request.executionHostId,
    captureId: mode === 'capture' ? '22222222-2222-4222-8222-222222222222' : request.captureId,
    phase: mode === 'phase' ? 'healed' : 'corrupt',
    source: request.source,
    hostPaths: {
      directory: `/fixture/cli-${request.captureId}`,
      pngPath:
        mode === 'host-path'
          ? '/private-unrequested-fixture'
          : `/fixture/cli-${request.captureId}/corrupt.png`,
      metadataPath: `/fixture/cli-${request.captureId}/corrupt.json`
    },
    pathsAreOnSelectedHost: true,
    written: true,
    rendererCaptureVerified: mode === 'renderer-proof',
    pngSha256:
      mode === 'png-hash'
        ? '0'.repeat(64)
        : createHash('sha256').update(Buffer.from('iVBORw0KGgo=', 'base64')).digest('hex'),
    metadataSha256:
      mode === 'metadata-hash'
        ? '0'.repeat(64)
        : createHash('sha256')
            .update(`${JSON.stringify(terminalRenderEvidenceMetadata(request), null, 2)}\n`)
            .digest('hex'),
    retention: { maxCaptureDirectories: 4, maxAggregateBytes: 96 * 1024 * 1024, timeLimit: null },
    ...(mode === 'private-field' ? { metadata: request.metadata } : {})
  }
  vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: mode === 'runtime' ? 'other' : 'fixture' },
    result: response
  })
  try {
    const file = join(root, 'request.json')
    await writeFile(file, JSON.stringify(request))
    await main(['terminal', 'write-render-evidence', '--request-file', file, '--json'], root)
    expect(process.exitCode).toBe(1)
    const result = JSON.parse(String(output.mock.calls.at(-1)?.[0]))
    expect(result.error.code).toBe('invalid_runtime_response')
    expect(JSON.stringify(result)).not.toContain('private-unrequested-fixture')
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})
