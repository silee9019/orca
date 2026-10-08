import { createHash } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import {
  TerminalRenderEvidenceParams,
  TerminalRenderEvidenceReceipt,
  terminalRenderEvidenceMetadata
} from '../../shared/rpc-contract/terminal-render-evidence-params'
import { readAgentSessionRequest } from './agent-session-request'

export const TERMINAL_RENDER_EVIDENCE_HANDLERS: Record<string, CommandHandler> = {
  'terminal write-render-evidence': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, TerminalRenderEvidenceParams)
    const response = await ctx.client.call('terminal.writeRenderEvidence', params)
    const result = TerminalRenderEvidenceReceipt.safeParse(response.result)
    if (
      !result.success ||
      response._meta.runtimeId !== params.expectedRuntimeId ||
      ['expectedRuntimeId', 'executionHostId', 'captureId', 'phase', 'source'].some(
        (key) => Reflect.get(result.data, key) !== Reflect.get(params, key)
      )
    ) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The host returned an invalid render evidence receipt.'
      )
    }
    const png = Buffer.from(params.pngDataUrl.slice('data:image/png;base64,'.length), 'base64')
    const metadata = `${JSON.stringify(terminalRenderEvidenceMetadata(params), null, 2)}\n`
    if (
      result.data.pngSha256 !== createHash('sha256').update(png).digest('hex') ||
      result.data.metadataSha256 !== createHash('sha256').update(metadata).digest('hex')
    ) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The host evidence hashes do not match the supplied content.'
      )
    }
    printResult({ ...response, result: result.data }, ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  }
}
