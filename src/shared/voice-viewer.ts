import { z } from 'zod'

const target = { viewer: z.literal('host') }
const operationId = z.string().trim().min(1).max(256)
export const VoiceViewerParams = z.discriminatedUnion('operation', [
  z.object({
    ...target,
    operation: z.enum([
      'microphones-list',
      'microphone-request-start',
      'settings-open',
      'key-dialog-open',
      'key-dialog-close',
      'tip-settings-open',
      'tip-show',
      'tip-close',
      'tip-skip',
      'tip-enable',
      'tip-focus-primary',
      'vm-copy-prompt'
    ])
  }),
  z.object({
    ...target,
    operation: z.literal('microphone-select'),
    deviceId: z.string().max(1024)
  }),
  z.object({ ...target, operation: z.literal('microphone-request-status'), operationId }),
  z.object({ ...target, operation: z.literal('microphone-request-cancel'), operationId }),
  z.object({
    ...target,
    operation: z.literal('vm-composer'),
    repoId: operationId,
    recipeId: operationId
  }),
  z.object({ ...target, operation: z.literal('vm-copy-cleanup'), runtimeId: operationId })
])
export type VoiceViewerOperation = z.infer<typeof VoiceViewerParams>
export type VoiceViewerRequest = { id: string; expiresAt: number; command: VoiceViewerOperation }
export const VoiceViewerResultSchema = z.object({
  viewer: z.literal('host'),
  viewerId: z.number().int(),
  applied: z.boolean(),
  persisted: z.boolean(),
  devices: z.array(z.object({ deviceId: z.string(), label: z.string() })).optional(),
  microphoneDeviceId: z.string().nullable().optional(),
  operationId: z.string().optional(),
  requestState: z.enum(['pending', 'granted', 'denied', 'cancelled']).optional(),
  nativePending: z.boolean().optional(),
  osPromptDismissed: z.literal(false).optional(),
  reason: z.string().optional()
})
export type VoiceViewerResult = z.infer<typeof VoiceViewerResultSchema>
export type VoiceViewerResponse = { id: string } & (
  | { ok: true; result: VoiceViewerResult }
  | { ok: false; error: string }
)
