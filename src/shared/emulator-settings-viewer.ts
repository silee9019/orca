import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive() }
export const EmulatorSettingsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...viewer,
      operation: z.enum([
        'emulator.settings-get',
        'emulator.refresh',
        'emulator.skill-refresh',
        'emulator.sdk-clear',
        'emulator.sdk-locate',
        'emulator.studio-open'
      ])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('emulator.sdk-set'),
      path: z.string().min(1).max(65536)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('emulator.example-copy'),
      exampleIndex: z.number().int().min(0).max(2)
    })
    .strict(),
  z.object({ ...viewer, operation: z.literal('emulator.enabled'), value: z.boolean() }).strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('emulator.default-device'),
      deviceId: z.string().min(1).nullable()
    })
    .strict()
])
export const EmulatorSettingsViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    state: z
      .object({
        enabled: z.boolean(),
        skillReady: z.boolean(),
        availabilityKnown: z.boolean(),
        available: z.boolean(),
        refreshing: z.boolean(),
        sdkPathSet: z.boolean(),
        defaultDeviceSet: z.boolean(),
        deviceCount: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict()
export type EmulatorSettingsViewerState = z.infer<
  typeof EmulatorSettingsViewerResultSchema
>['state']
export type EmulatorSettingsViewerResult = z.infer<typeof EmulatorSettingsViewerResultSchema>
