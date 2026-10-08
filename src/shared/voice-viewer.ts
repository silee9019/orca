import { z } from 'zod'

const target = { viewer: z.literal('host') }
const operationId = z.string().trim().min(1).max(256)
export const VoiceViewerParams = z.discriminatedUnion('operation', [
  z.object({
    ...target,
    operation: z.enum([
      'model-menu-open',
      'model-menu-close',
      'model-menu-status',
      'microphones-list',
      'microphone-request-start',
      'settings-open',
      'key-dialog-close',
      'key-draft-clear',
      'tip-settings-open',
      'tip-show',
      'tip-close',
      'tip-skip',
      'tip-enable',
      'tip-focus-primary',
      'vm-copy-prompt',
      'vm-catalog-refresh'
    ])
  }),
  z.object({
    ...target,
    operation: z.literal('microphone-select'),
    deviceId: z.string().max(1024)
  }),
  z.object({ ...target, operation: z.literal('key-dialog-open'), modelId: operationId.optional() }),
  z.object({
    ...target,
    operation: z.enum(['voice-toggle', 'voice-refresh-models', 'key-save', 'key-clear'])
  }),
  z.object({ ...target, operation: z.literal('voice-pane-status'), operationId }),
  z.object({ ...target, operation: z.literal('microphone-request-status'), operationId }),
  z.object({ ...target, operation: z.literal('microphone-request-cancel'), operationId }),
  z.object({
    ...target,
    operation: z.literal('vm-composer'),
    repoId: operationId,
    recipeId: operationId
  }),
  z.object({ ...target, operation: z.literal('vm-copy-cleanup'), runtimeId: operationId }),
  z.object({ ...target, operation: z.literal('vm-runtimes-refresh') }),
  z.object({ ...target, operation: z.literal('vm-runtime-cleanup'), runtimeId: operationId }),
  z.object({
    ...target,
    operation: z.literal('vm-runtime-stop'),
    runtimeId: operationId,
    confirmation: operationId
  }),
  z.object({ ...target, operation: z.literal('vm-runtime-status'), operationId }),
  z.object({
    ...target,
    operation: z.enum(['vm-stop-confirm-open', 'vm-stop-confirm-cancel']),
    runtimeId: operationId
  }),
  z.object({ ...target, operation: z.literal('key-draft'), apiKey: z.string().min(1).max(8192) }),
  z.object({
    ...target,
    operation: z.literal('model-delete-start'),
    modelId: operationId,
    confirmation: operationId
  }),
  z.object({ ...target, operation: z.literal('model-delete-status'), operationId }),
  z.object({ ...target, operation: z.enum(['dictation-start', 'dictation-toggle']) }),
  z.object({
    ...target,
    operation: z.enum(['dictation-stop', 'dictation-cancel', 'dictation-status']),
    operationId
  })
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
  modelId: z.string().optional(),
  modelMenuOpen: z.boolean().optional(),
  deleteState: z.enum(['pending', 'succeeded', 'failed']).optional(),
  draftPresent: z.boolean().optional(),
  vmActionState: z.enum(['pending', 'succeeded', 'failed']).optional(),
  voiceEnabled: z.boolean().optional(),
  keyConfigured: z.boolean().optional(),
  paneState: z.enum(['pending', 'succeeded', 'failed']).optional(),
  dictationState: z.enum(['idle', 'starting', 'listening', 'stopping', 'error']).optional(),
  targetCaptured: z.boolean().optional(),
  cancellationRequested: z.boolean().optional(),
  nativePending: z.boolean().optional(),
  osPromptDismissed: z.literal(false).optional(),
  reason: z.string().optional()
})
export type VoiceViewerResult = z.infer<typeof VoiceViewerResultSchema>
export type VoiceViewerResponse = { id: string } & (
  | { ok: true; result: VoiceViewerResult }
  | { ok: false; error: string }
)
