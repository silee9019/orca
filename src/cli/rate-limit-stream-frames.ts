import { z } from 'zod'
const window = z.object({
  usedPercent: z.number().finite(),
  windowMinutes: z.number().finite(),
  resetsAt: z.number().finite().nullable()
})
function provider(name: string) {
  return z.object({
    provider: z.literal(name),
    session: window.nullable(),
    weekly: window.nullable(),
    fableWeekly: window.nullable().optional(),
    monthly: window.nullable().optional(),
    updatedAt: z.number().finite(),
    status: z.enum(['idle', 'fetching', 'ok', 'error', 'unavailable'])
  })
}
const state = z.object({
  claude: provider('claude').nullable(),
  codex: provider('codex').nullable(),
  gemini: provider('gemini').nullable(),
  opencodeGo: provider('opencode-go').nullable(),
  kimi: provider('kimi').nullable(),
  minimax: provider('minimax').nullable(),
  grok: provider('grok').nullable(),
  antigravity: provider('antigravity').nullable(),
  cursor: provider('cursor').nullable(),
  zcode: provider('zcode').nullable()
})
const frame = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), subscriptionId: z.string().min(1), state }).strict(),
  z.object({ type: z.literal('snapshot'), state }).strict(),
  z.object({ type: z.literal('end') }).strict()
])
export function sanitizeRateLimitStreamFrame(input: unknown) {
  const parsed = frame.safeParse(input)
  if (!parsed.success) {
    throw new Error('Invalid rate-limit stream response')
  }
  if (parsed.data.type === 'ready') {
    return { type: parsed.data.type, state: parsed.data.state }
  }
  return parsed.data
}
