import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag } from '../flags'
import { resolveSshHostTargetId } from '../host-selector-alternatives'
import { RuntimeClientError } from '../runtime-client'
import {
  SettingsPreflightContext,
  SettingsPreflightOutput,
  SettingsAgentsOutput,
  SettingsRefreshOutput
} from '../../shared/cli-settings-preflight'
import { callSettings } from '../settings-runtime-call'

function context(flags: Map<string, string | boolean>) {
  const result = SettingsPreflightContext.safeParse({
    wslDistro: getOptionalStringFlag(flags, 'wsl'),
    wslDefault: flags.get('wsl-default') === true
  })
  if (!result.success) {
    throw new RuntimeClientError('invalid_argument', 'Choose --wsl or --wsl-default.')
  }
  return result.data
}

export const SETTINGS_DETECTION_HANDLERS: Record<string, CommandHandler> = {
  'settings preflight check': async ({ client, flags, json }) => {
    const response = await callSettings(() =>
      client.call('settings.control.preflightCheck', {
        ...context(flags),
        force: flags.get('force') === true
      })
    )
    const result = SettingsPreflightOutput.parse(response.result)
    printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings agents detect': async ({ client, flags, json }) => {
    const host = getOptionalStringFlag(flags, 'host') ?? 'local'
    if (host !== 'local' && !host.startsWith('runtime:') && !host.startsWith('ssh:')) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--host must be local, runtime:<id|name>, or ssh:<id|label>.'
      )
    }
    if (host.startsWith('ssh:') && (flags.has('wsl') || flags.has('wsl-default'))) {
      throw new RuntimeClientError('invalid_argument', 'WSL and SSH targets cannot be combined.')
    }
    const response = !host.startsWith('ssh:')
      ? await callSettings(() => client.call('settings.control.detectAgents', context(flags)))
      : await client.call('preflight.detectRemoteAgents', {
          connectionId: await resolveSshHostTargetId(client, host.slice(4), [])
        })
    const result = { host, agents: SettingsAgentsOutput.parse(response.result) }
    printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings agents refresh': async ({ client, flags, json }) => {
    const response = await callSettings(() =>
      client.call('settings.control.refreshAgents', context(flags))
    )
    const result = SettingsRefreshOutput.parse(response.result)
    printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings agents zcode-capability': async ({ client, json }) => {
    const response = await callSettings(() =>
      client.call<{ capability: 'interactive' | 'missing-tui' | 'unknown' }>(
        'preflight.zcodeInteractiveCapability'
      )
    )
    printResult(response, json, ({ capability }) => capability)
  }
}
