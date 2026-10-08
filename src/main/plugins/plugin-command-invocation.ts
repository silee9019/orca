import { parsePluginCommandInput } from '../../shared/plugins/plugin-command-input'
import type { PluginWorkerHandle } from './plugin-host-process'
import type { ValidDiscoveredPlugin } from './plugin-discovery'

export function assertPluginWorkerCommand(plugin: ValidDiscoveredPlugin, commandId: string) {
  const command = plugin.manifest.contributes.commands.find((entry) => entry.id === commandId)
  if (!command) {
    throw new Error(`plugin ${plugin.pluginKey} does not contribute command ${commandId}`)
  }
  // Declarative aliases are renderer-owned and must never cross the worker
  // activation boundary, even if a compromised renderer invokes IPC directly.
  if (command.action !== undefined) {
    throw new Error(`plugin ${plugin.pluginKey} command ${commandId} is a built-in action alias`)
  }
  return command
}

export async function invokePluginWorkerCommand(
  plugin: ValidDiscoveredPlugin,
  commandId: string,
  args: unknown,
  ensure: () => Promise<
    Pick<PluginWorkerHandle, 'commands' | 'commandInputVersion' | 'invokeCommand'>
  >
): Promise<unknown> {
  const command = assertPluginWorkerCommand(plugin, commandId)
  const input = command.input ? parsePluginCommandInput(command.input, args) : args
  const handle = await ensure()
  if (!handle.commands.includes(commandId)) {
    throw new Error(`plugin ${plugin.pluginKey} registered no handler for ${commandId}`)
  }
  if (command.input && handle.commandInputVersion !== 1) {
    throw new Error('Plugin worker does not support command input validation')
  }
  return handle.invokeCommand(commandId, input, command.input)
}
