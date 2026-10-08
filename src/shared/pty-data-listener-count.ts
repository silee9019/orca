import { z } from 'zod'
export const PTY_DATA_LISTENER_COUNT_REQUEST = 'pty:requestDataListenerCount'
export const PTY_DATA_LISTENER_COUNT_REPLY = 'pty:dataListenerCountReply'
export const PtyDataListenerCountRequest = z.object({ requestId: z.string().uuid() }).strict()
export const PtyDataListenerCountReply = PtyDataListenerCountRequest.extend({
  count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
}).strict()
