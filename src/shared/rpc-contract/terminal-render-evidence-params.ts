import { z } from 'zod'

export const TerminalRenderEvidenceParams = z
  .object({
    expectedRuntimeId: z.string().min(1).max(256),
    executionHostId: z.literal('local'),
    captureId: z.string().uuid(),
    phase: z.enum(['corrupt', 'healed']),
    source: z.literal('cli-supplied'),
    confirm: z.literal(true),
    includeContent: z.literal(true),
    pngDataUrl: z
      .string()
      .max(2 * 1024 * 1024)
      .regex(
        /^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
      )
      .refine((value) => {
        try {
          return atob(value.slice('data:image/png;base64,'.length)).startsWith(atob('iVBORw0KGgo='))
        } catch {
          return false
        }
      }),
    metadata: z
      .record(z.string(), z.unknown())
      .refine(
        (value) => new TextEncoder().encode(JSON.stringify(value, null, 2)).byteLength <= 256 * 1024
      )
      .optional()
  })
  .strict()
export const TerminalRenderEvidenceReceipt = TerminalRenderEvidenceParams.pick({
  expectedRuntimeId: true,
  executionHostId: true,
  captureId: true,
  phase: true,
  source: true
})
  .extend({
    hostPaths: z
      .object({
        directory: z.string().min(1).max(8192),
        pngPath: z.string().min(1).max(8192),
        metadataPath: z.string().min(1).max(8192)
      })
      .strict(),
    pathsAreOnSelectedHost: z.literal(true),
    written: z.literal(true),
    rendererCaptureVerified: z.literal(false),
    pngSha256: z.string().regex(/^[a-f0-9]{64}$/),
    metadataSha256: z.string().regex(/^[a-f0-9]{64}$/),
    retention: z
      .object({
        maxCaptureDirectories: z.literal(4),
        maxAggregateBytes: z.literal(100663296),
        timeLimit: z.null()
      })
      .strict()
  })
  .strict()
  .superRefine((value, ctx) => {
    const paths = value.hostPaths
    const matches = ['/', String.fromCharCode(92)].some(
      (separator) =>
        paths.directory.endsWith(`${separator}cli-${value.captureId}`) &&
        paths.pngPath === `${paths.directory + separator + value.phase}.png` &&
        paths.metadataPath === `${paths.directory + separator + value.phase}.json`
    )
    if (!matches) {
      ctx.addIssue({ code: 'custom', message: 'Invalid host evidence paths' })
    }
  })

export function terminalRenderEvidenceMetadata(
  params: z.output<typeof TerminalRenderEvidenceParams>
) {
  return {
    ...params.metadata,
    cliSource: {
      runtimeId: params.expectedRuntimeId,
      captureId: params.captureId,
      source: params.source
    }
  }
}
