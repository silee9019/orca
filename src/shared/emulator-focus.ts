import { z } from 'zod'
import { EmulatorFrameStateSchema, type EmulatorFrameParams } from './emulator-frame-command'
export const EmulatorFocusResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    worktreeId: z.string(),
    tabId: z.string(),
    groupId: z.string(),
    applied: z.literal(true),
    frameState: EmulatorFrameStateSchema.optional()
  })
  .strict()
export type EmulatorFocusResult = z.infer<typeof EmulatorFocusResultSchema>
export type EmulatorFocusRequest = {
  id: string
  worktreeId: string
  expiresAt: number
  frame?: Pick<EmulatorFrameParams, 'tabId' | 'action'>
}
export type EmulatorFocusResponse = { id: string } & (
  | { ok: true; result: EmulatorFocusResult }
  | { ok: false; error: string }
)
export type EmulatorFocusApi = {
  onFocusRequest: (callback: (request: EmulatorFocusRequest) => void) => () => void
  respondFocus: (response: EmulatorFocusResponse) => void
  onFrameRequest: (callback: (request: EmulatorFocusRequest) => void) => () => void
}
