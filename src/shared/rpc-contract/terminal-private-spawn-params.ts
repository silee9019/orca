import { z } from 'zod'
import { parseExecutionHostId } from '../execution-host'
import { TerminalCreateParams } from './terminal-unary-params'
const PrivateEnvironment = z
  .record(z.string().min(1).max(256), z.string().max(65536))
  .refine((env) => Object.keys(env).length <= 64)
export const TerminalPrivateSpawnParams = TerminalCreateParams.pick({
  startupCommandDelivery: true,
  envToDelete: true,
  resumeProviderSession: true,
  launchAgent: true,
  shell: true,
  terminalKittyKeyboardProtocol: true,
  terminalColorQueryReplies: true
})
  .extend({
    expectedRuntimeId: z.string().min(1),
    expectedExecutionHostId: z.string().refine((value) => {
      const host = parseExecutionHostId(value)
      return !!host && host.kind !== 'runtime'
    }),
    worktreeId: z.string().min(1).max(32768),
    clientMutationId: z.string().uuid(),
    cols: z.number().int().min(1).max(1000),
    rows: z.number().int().min(1).max(1000),
    confirm: z.literal(true),
    command: z.string().max(65536).optional(),
    cwd: z.string().min(1).max(32768).optional(),
    title: z.string().max(256).optional(),
    env: PrivateEnvironment.optional(),
    launchConfig: z
      .object({
        agentCommand: z.string().max(65536).optional(),
        agentArgs: z.string().max(65536),
        agentEnv: PrivateEnvironment,
        ompResumeFilePath: z.string().min(1).max(32768).optional()
      })
      .strict()
      .optional(),
    tabId: z.string().min(1).max(256).optional(),
    leafId: z.string().min(1).max(256).optional(),
    requireFreshPane: z.boolean().default(true)
  })
  .strict()
  .refine((params) => (params.tabId === undefined) === (params.leafId === undefined))
export const TerminalPrivateSpawnReceipt = z
  .object({
    expectedRuntimeId: z.string().min(1),
    clientMutationId: z.string().uuid(),
    terminal: z
      .object({
        handle: z.string().min(1),
        ptyId: z.string().min(1),
        worktreeId: z.string().min(1),
        executionHostId: z.string().min(1),
        surface: z.literal('background'),
        isReattach: z.boolean()
      })
      .strict(),
    requested: z
      .object({ cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(1000) })
      .strict(),
    rendererApplied: z.literal(false),
    providerGeometryVerified: z.literal(false)
  })
  .strict()
