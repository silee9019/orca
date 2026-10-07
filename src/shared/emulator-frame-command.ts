import { z } from 'zod'
const pixel = z.number().finite().min(-100000).max(100000)
const WheelAction = z
  .object({
    type: z.literal('wheel'),
    clientX: pixel,
    clientY: pixel,
    deltaX: pixel,
    deltaY: pixel,
    deltaMode: z.union([z.literal(0), z.literal(1), z.literal(2)])
  })
  .strict()
  .refine((action) => action.deltaX !== 0 || action.deltaY !== 0, 'Wheel delta must be nonzero')
export const EmulatorFrameActionSchema = z.union([
  WheelAction,
  z.object({ type: z.literal('key'), key: z.string().min(1).max(32), shift: z.boolean() }).strict(),
  z.object({ type: z.literal('paste'), text: z.string().min(1).max(4096) }).strict(),
  z.object({ type: z.literal('rotate') }).strict(),
  z.object({ type: z.literal('focus-group'), groupId: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal('select-tab'),
      executionHostId: z.union([
        z.literal('local'),
        z.templateLiteral(['ssh:', z.string()]),
        z.templateLiteral(['runtime:', z.string()])
      ])
    })
    .strict()
])
export type EmulatorFrameAction = z.infer<typeof EmulatorFrameActionSchema>
export const EmulatorFrameStateSchema = z
  .object({
    streamError: z.boolean(),
    keyboardCaptureActive: z.boolean().optional(),
    visualOrientation: z.enum(['portrait', 'landscape']).optional(),
    streamSize: z.object({ width: z.number(), height: z.number() }).nullable()
  })
  .strict()
export type EmulatorFrameState = z.infer<typeof EmulatorFrameStateSchema>
export const EmulatorFrameParams = z
  .object({
    worktree: z.string().min(1),
    tabId: z.string().min(1),
    action: EmulatorFrameActionSchema
  })
  .strict()
export type EmulatorFrameParams = z.infer<typeof EmulatorFrameParams>

export const EmulatorWheelParams = EmulatorFrameParams.refine(
  (params) => params.action.type === 'wheel'
)

export const EmulatorScreenKeyParams = EmulatorFrameParams.refine(
  (params) => params.action.type === 'key'
)

export const EmulatorScreenPasteParams = EmulatorFrameParams.refine(
  (params) => params.action.type === 'paste'
)

export const EmulatorRotateViewParams = EmulatorFrameParams.refine(
  (params) => params.action.type === 'rotate'
)

export const EmulatorFocusGroupParams = EmulatorFrameParams.refine(
  (params) => params.action.type === 'focus-group'
)

export const EmulatorSelectTabParams = EmulatorFrameParams.refine(
  (params) => params.action.type === 'select-tab'
)
