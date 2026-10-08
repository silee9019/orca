import { z } from 'zod'
const Desktop = z.object({ expectedExecutionHostId: z.literal('local') })
export const DesktopNestedScanStart = Desktop.extend({
  expectedScanHostId: z.union([
    z.literal('local'),
    z
      .string()
      .regex(/^ssh:[^\s]+$/)
      .max(512)
  ]),
  path: z.string().min(1).max(4096),
  options: z
    .object({
      maxDepth: z.number().int().min(1).max(8).default(4),
      maxRepos: z.number().int().min(1).max(500).default(100),
      timeoutMs: z.number().int().min(500).max(30000).default(15000)
    })
    .strict()
    .default({ maxDepth: 4, maxRepos: 100, timeoutMs: 15000 })
}).strict()
export const DesktopNestedScanRequest = Desktop.extend({ requestId: z.string().uuid() }).strict()
export const DesktopNestedScanResult = DesktopNestedScanRequest.extend({
  offset: z.number().int().min(0).max(500).default(0),
  limit: z.number().int().min(1).max(500).default(100)
}).strict()
