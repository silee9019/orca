import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { OrcaYamlTrustViewerCommand } from './rpc-contract/orca-yaml-trust-viewer-params'

// The script content is not part of the snapshot: only its hash identifies the prompt.
export const OrcaYamlTrustPromptSchema = z
  .object({
    repoId: z.string(),
    repoName: z.string(),
    scriptKind: z.string(),
    previouslyApproved: z.boolean(),
    contentHash: z.string()
  })
  .strip()
export type OrcaYamlTrustPrompt = z.infer<typeof OrcaYamlTrustPromptSchema>
export const OrcaYamlTrustSnapshotSchema = z
  .object({
    runtimeContextKey: z.string(),
    open: z.boolean(),
    prompt: OrcaYamlTrustPromptSchema.nullable()
  })
  .strip()
export type OrcaYamlTrustSnapshot = z.infer<typeof OrcaYamlTrustSnapshotSchema>
export const OrcaYamlTrustViewerResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    dispatched: z.boolean(),
    applied: z.boolean(),
    // The dialog's "Don't run" persists nothing, so no host write is requested.
    writeOutcome: openEnum(['not_requested', 'unknown'], 'unknown'),
    // What the request told the script's caller; open-ended so a newer host never reads as a skip.
    decision: z.string().nullable(),
    // The prompt the request acted on, or the open prompt for a read; null when none is open.
    prompt: OrcaYamlTrustPromptSchema.nullable(),
    // Whether a prompt is showing now, which may be a different prompt than the one acted on.
    open: z.boolean(),
    rendered: OrcaYamlTrustSnapshotSchema.nullable(),
    reason: openEnum(
      ['viewer_runtime_changed', 'orca_yaml_trust_still_open'],
      'orca_yaml_trust_still_open'
    ).optional()
  })
  .strip()
export type OrcaYamlTrustViewerResult = z.infer<typeof OrcaYamlTrustViewerResultSchema>
export type OrcaYamlTrustViewerRequest = {
  id: string
  expiresAt: number
  command: OrcaYamlTrustViewerCommand
}
export type OrcaYamlTrustViewerResponse =
  | { id: string; ok: true; result: OrcaYamlTrustViewerResult }
  | { id: string; ok: false; error: string }
