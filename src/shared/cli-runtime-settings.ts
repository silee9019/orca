import { z } from 'zod'
import { SettingsUpdate } from './rpc-contract/client-settings-params'
import { isTuiAgent } from './tui-agent-config'
import type { TuiAgent } from './tui-agent'

const AgentId = z.custom<TuiAgent>(isTuiAgent)

export const CliSettingsUpdate = SettingsUpdate.unwrap().extend({
  defaultTuiAgent: z.union([AgentId, z.literal('blank'), z.null()]).optional(),
  disabledTuiAgents: z.array(AgentId).optional(),
  agentDefaultArgs: z.record(AgentId, z.string()).optional(),
  agentDefaultEnv: z.record(AgentId, z.record(z.string(), z.string())).optional(),
  prBotAuthorOverrides: z.array(z.string()).optional()
})

const CliSettingsRead = CliSettingsUpdate.omit({
  agentDefaultArgs: true,
  agentDefaultEnv: true
})
  .extend({
    defaultTuiAgent: z.string().nullable().optional(),
    disabledTuiAgents: z.array(z.string()).optional()
  })
  .strip()

export function parseCliSettingsUpdate(value: unknown): z.infer<typeof CliSettingsUpdate> {
  const parsed = CliSettingsUpdate.safeParse(value)
  if (!parsed.success) {
    throw new Error('Invalid settings update')
  }
  return parsed.data
}

export function projectCliSettings(value: unknown): z.infer<typeof CliSettingsRead> {
  return CliSettingsRead.parse(value)
}
