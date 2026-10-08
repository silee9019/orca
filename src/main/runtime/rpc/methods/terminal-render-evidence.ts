import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { getAppEnvironment } from '../../../../shared/app-environment'
import {
  TerminalRenderEvidenceParams,
  terminalRenderEvidenceMetadata
} from '../../../../shared/rpc-contract/terminal-render-evidence-params'
import { queueTerminalRenderDesyncEvidence } from '../../../terminal-render-desync-evidence-store'
import { defineMethod } from '../core'

export const TERMINAL_RENDER_EVIDENCE_METHODS = [
  defineMethod({
    name: 'terminal.writeRenderEvidence',
    params: TerminalRenderEvidenceParams,
    handler: async (params, { runtime, clientKind }) => {
      if (clientKind === 'mobile' || params.expectedRuntimeId !== runtime.getRuntimeId()) {
        throw new Error('render_evidence_owner_changed')
      }
      try {
        const saved = await queueTerminalRenderDesyncEvidence(
          getAppEnvironment().getPath('userData'),
          {
            captureId: `cli-${params.captureId}`,
            phase: params.phase,
            pngDataUrl: params.pngDataUrl,
            metadata: terminalRenderEvidenceMetadata(params)
          },
          { exclusive: true }
        )
        if (!saved.metadataPath) {
          throw new Error('render_evidence_metadata_missing')
        }
        const [png, metadata] = await Promise.all([
          readFile(saved.pngPath),
          readFile(saved.metadataPath)
        ])
        const expected = Buffer.from(
          params.pngDataUrl.slice('data:image/png;base64,'.length),
          'base64'
        )
        const expectedMetadata = Buffer.from(
          `${JSON.stringify(terminalRenderEvidenceMetadata(params), null, 2)}\n`
        )
        if (!png.equals(expected) || !metadata.equals(expectedMetadata)) {
          throw new Error('render_evidence_readback_changed')
        }
        return {
          expectedRuntimeId: params.expectedRuntimeId,
          executionHostId: params.executionHostId,
          captureId: params.captureId,
          phase: params.phase,
          source: params.source,
          hostPaths: {
            directory: saved.directory,
            pngPath: saved.pngPath,
            metadataPath: saved.metadataPath
          },
          pathsAreOnSelectedHost: true,
          written: true,
          rendererCaptureVerified: false,
          pngSha256: createHash('sha256').update(png).digest('hex'),
          metadataSha256: createHash('sha256').update(metadata).digest('hex'),
          retention: {
            maxCaptureDirectories: 4,
            maxAggregateBytes: 96 * 1024 * 1024,
            timeLimit: null
          }
        }
      } catch {
        throw new Error('render_evidence_write_failed_or_partial')
      }
    }
  })
]
