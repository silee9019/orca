import { z } from 'zod'

const viewer = z.literal('host')
// Why: a repeated --repo reaches the parser NUL-joined, so control characters are refused.
const hasNoControlCharacter = (value: string): boolean => !/\p{Cc}/u.test(value)
export const ORCA_YAML_TRUST_SCRIPT_KINDS = [
  'setup',
  'archive',
  'issueCommand',
  'vmRecipe'
] as const

export const OrcaYamlTrustViewerParams = z.discriminatedUnion('operation', [
  z.object({ viewer, operation: z.literal('get') }).strict(),
  z
    .object({
      viewer,
      operation: z.literal('skip'),
      repoId: z.string().min(1).refine(hasNoControlCharacter).optional(),
      scriptKind: z.enum(ORCA_YAML_TRUST_SCRIPT_KINDS).optional()
    })
    .strict()
])
export type OrcaYamlTrustViewerCommand = z.infer<typeof OrcaYamlTrustViewerParams>
