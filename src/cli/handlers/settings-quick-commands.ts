import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getRequiredStringFlag } from '../flags'
import { parseHostFlag } from '../execution-host-flag'
import { readSettingsJsonInput } from '../settings-json-input'
import { callSettings } from '../settings-runtime-call'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import type { RuntimeClient } from '../runtime-client'
import { TerminalQuickCommandsUpdate } from '../../shared/rpc-contract/terminal-quick-command-params'

// Why: command bodies are launch commands, so output keeps only what identifies a command.
const QuickCommandList = z.object({
  terminalQuickCommands: z.array(
    z.object({ id: z.string(), label: z.string(), action: z.string().optional() })
  )
})

function resolveQuickCommandHost(flags: Map<string, string | boolean>, client: RuntimeClient) {
  const host = parseHostFlag(flags)
  if (host?.kind === 'ssh') {
    throw new RuntimeClientError(
      'invalid_argument',
      `--host ${host.id} cannot own quick commands; they live on a local or paired runtime host. Use local or runtime:<id>.`
    )
  }
  // Why: a quick command written to a host other than the one named would silently answer for the wrong machine.
  if (host?.kind === 'local' && client.isRemote) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--host local conflicts with the selected paired runtime; drop --host or --environment/--pairing-code.'
    )
  }
  if (host?.kind === 'runtime' && !client.isRemote) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--host ${host.id} was not routed to its paired runtime; refusing to write locally.`
    )
  }
  return {
    id: host?.id ?? (client.isRemote ? 'selected-runtime' : 'local'),
    explicit: host !== undefined
  }
}

function project(response: { result: unknown }, host: string) {
  const parsed = QuickCommandList.safeParse(response.result)
  if (!parsed.success) {
    throw new RuntimeClientError(
      'invalid_runtime_response',
      `The ${host} host returned an unreadable quick command list.`
    )
  }
  return { host, commands: parsed.data.terminalQuickCommands }
}

const printCommands = (value: { commands: { id: string; label: string }[] }) =>
  value.commands.map((command) => `${command.id}\t${command.label}`).join('\n') ||
  'No quick commands.'

export const SETTINGS_QUICK_COMMAND_HANDLERS: Record<string, CommandHandler> = {
  'settings quick-commands list': async ({ flags, client, json }) => {
    const host = resolveQuickCommandHost(flags, client)
    const response = await callSettings(() => client.call('settings.getTerminalQuickCommands'))
    printResult({ ...response, result: project(response, host.id) }, json, printCommands)
  },
  'settings quick-commands update': async ({ flags, client, cwd, json }) => {
    const host = resolveQuickCommandHost(flags, client)
    const input = await readSettingsJsonInput(getRequiredStringFlag(flags, 'file'), cwd)
    const parsed = TerminalQuickCommandsUpdate.safeParse({ mutation: input })
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid quick command update.')
    }
    const response = await callSettings(() =>
      client.call('settings.updateTerminalQuickCommands', parsed.data)
    ).catch((error: unknown) => {
      // Why: with no host answer the write may have landed, so it is neither a success nor a no-op.
      if (
        error instanceof RuntimeClientError &&
        !(error instanceof RuntimeRpcFailureError) &&
        (error.code === 'runtime_unavailable' || error.code === 'runtime_timeout')
      ) {
        const target = host.explicit ? ` --host ${host.id}` : ''
        throw new RuntimeClientError(
          error.code,
          `${error.message} The update to ${host.id} was not confirmed and may or may not have been applied; run \`orca settings quick-commands list${target}\` before retrying.`,
          { host: host.id, writeConfirmed: false }
        )
      }
      throw error
    })
    printResult({ ...response, result: project(response, host.id) }, json, printCommands)
  }
}
