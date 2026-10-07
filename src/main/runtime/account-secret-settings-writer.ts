import { z } from 'zod'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { normalizeProxyUrl, normalizeProxyBypassRules } from '../../shared/network-proxy'
import { normalizeTuiAgentEnvRecord } from '../../shared/tui-agent-launch-defaults'
import { isTuiAgent } from '../../shared/tui-agent-config'
import type { AccountSecretSettingOperation } from '../../shared/rpc-contract/account-secret-settings-params'

type AccountSecretSettingsPatch = Partial<
  Pick<
    GlobalSettings,
    'agentDefaultEnv' | 'httpProxyUrl' | 'httpProxyBypassRules' | 'opencodeSessionCookie'
  >
>
export type AccountSecretSettingsWriter = (patch: AccountSecretSettingsPatch) => Promise<unknown>
let writer: AccountSecretSettingsWriter | null = null

export function setAccountSecretSettingsWriter(next: AccountSecretSettingsWriter | null): void {
  writer = next
}

const AgentEnvInput = z.record(
  z.string().refine(isTuiAgent),
  z.record(z.string().trim().min(1), z.string())
)

function buildPatch(operation: AccountSecretSettingOperation): AccountSecretSettingsPatch {
  const input = operation.action === 'clear' ? '' : operation.input
  if (Buffer.byteLength(input) > 65536) {
    throw new Error('Sensitive setting input must contain at most 65536 bytes.')
  }
  switch (operation.key) {
    case 'agentDefaultEnv': {
      if (operation.action === 'clear') {
        return { agentDefaultEnv: {} }
      }
      try {
        return {
          agentDefaultEnv: normalizeTuiAgentEnvRecord(AgentEnvInput.parse(JSON.parse(input)))
        }
      } catch {
        throw new Error(
          'Provide an agent environment JSON object with supported agent names and string values.'
        )
      }
    }
    case 'httpProxyUrl': {
      const proxy = normalizeProxyUrl(input)
      if (!proxy.ok) {
        throw new Error(proxy.message)
      }
      return { httpProxyUrl: proxy.value }
    }
    case 'httpProxyBypassRules':
      return { httpProxyBypassRules: normalizeProxyBypassRules(input) }
    case 'opencodeSessionCookie':
      return { opencodeSessionCookie: input.trim() }
  }
}

export async function applyAccountSecretSetting(operation: AccountSecretSettingOperation) {
  const canonicalWriter = writer
  if (!canonicalWriter) {
    throw new Error(
      'Sensitive settings require the canonical settings writer on this host; no setting was changed.'
    )
  }
  const patch = buildPatch(operation)
  try {
    await canonicalWriter(patch)
  } catch {
    throw new Error('The canonical settings writer could not apply the sensitive setting.')
  }
  return { key: operation.key, updated: true }
}
