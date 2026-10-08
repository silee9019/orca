import type { PluginListEntry } from '../../shared/plugins/plugin-list-contract'
import { parsePluginCommandInput } from '../../shared/plugins/plugin-command-input'
import { getRequiredStringFlag } from '../flags'
import { readJsonInput } from '../json-input'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import type { CommandHandler } from '../dispatch'

const format = (value: unknown): string => JSON.stringify(value, null, 2)

export const PLUGIN_HANDLERS: Record<string, CommandHandler> = {
  'plugins panel-read': async (ctx) => {
    printResult(
      await ctx.client.call('plugins.inspectPanel', {
        pluginKey: getRequiredStringFlag(ctx.flags, 'plugin'),
        panelId: getRequiredStringFlag(ctx.flags, 'panel')
      }),
      ctx.json,
      format
    )
  },
  'plugins list': async ({ client, json }) => {
    printResult(await client.call('plugins.list'), json, format)
  },
  'plugins enable': async (ctx) => {
    printResult(
      await ctx.client.call('plugins.setEnabled', {
        pluginKey: getRequiredStringFlag(ctx.flags, 'plugin'),
        enabled: true
      }),
      ctx.json,
      format
    )
  },
  'plugins disable': async (ctx) => {
    printResult(
      await ctx.client.call('plugins.setEnabled', {
        pluginKey: getRequiredStringFlag(ctx.flags, 'plugin'),
        enabled: false
      }),
      ctx.json,
      format
    )
  },
  'plugins consent': async (ctx) => {
    const decision = getRequiredStringFlag(ctx.flags, 'decision')
    if (decision !== 'approve' && decision !== 'keep-disabled') {
      throw new RuntimeClientError('invalid_argument', 'Decision must be approve or keep-disabled')
    }
    printResult(
      await ctx.client.call('plugins.consent', {
        pluginKey: getRequiredStringFlag(ctx.flags, 'plugin'),
        reviewedFingerprint: getRequiredStringFlag(ctx.flags, 'fingerprint'),
        decision
      }),
      ctx.json,
      format
    )
  },
  'plugins command': async (ctx) => {
    const pluginKey = getRequiredStringFlag(ctx.flags, 'plugin')
    const commandId = getRequiredStringFlag(ctx.flags, 'command')
    const args = await readJsonInput(ctx)
    const listed = await ctx.client.call<PluginListEntry[]>('plugins.list')
    const plugin = listed.result.find((entry) => entry.pluginKey === pluginKey)
    const command = plugin?.commands.find((entry) => entry.id === commandId)
    if (!plugin || !command) {
      throw new RuntimeClientError('invalid_argument', 'Unknown plugin command')
    }
    if (command.handler.type !== 'worker') {
      throw new RuntimeClientError(
        'unsupported',
        'Built-in action aliases require a viewer command'
      )
    }
    if (args !== undefined && plugin.commandInputVersion !== 1) {
      throw new RuntimeClientError(
        'update_required',
        'Runtime does not support command input validation'
      )
    }
    const input = parsePluginCommandInput(command.input, args)
    printResult(
      await ctx.client.call('plugins.invokeCommand', { pluginKey, commandId, args: input }),
      ctx.json,
      format
    )
  },
  'plugins panel': async (ctx) => {
    printResult(
      await ctx.client.call('plugins.invokePanelAction', {
        pluginKey: getRequiredStringFlag(ctx.flags, 'plugin'),
        panelId: getRequiredStringFlag(ctx.flags, 'panel'),
        action: getRequiredStringFlag(ctx.flags, 'action'),
        params: await readJsonInput(ctx)
      }),
      ctx.json,
      format
    )
  }
}
