import { z } from 'zod'
export const EmulatorFocusResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    worktreeId: z.string(),
    tabId: z.string(),
    groupId: z.string(),
    applied: z.literal(true)
  })
  .strict()
export type EmulatorFocusResult = z.infer<typeof EmulatorFocusResultSchema>
export type EmulatorFocusRequest = { id: string; worktreeId: string; expiresAt: number }
export type EmulatorFocusResponse = { id: string } & (
  | { ok: true; result: EmulatorFocusResult }
  | { ok: false; error: string }
)
export type EmulatorFocusApi = {
  onFocusRequest: (callback: (request: EmulatorFocusRequest) => void) => () => void
  respondFocus: (response: EmulatorFocusResponse) => void
}
