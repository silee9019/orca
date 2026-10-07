import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { getEmulatorCommandTarget } from '../selectors'
import { RuntimeClientError } from '../runtime-client'
import { EmulatorControlParams } from '../../shared/rpc-contract/emulator-control-params'
import { getComputerTextActionFlags } from './computer-action-flags'

export const EMULATOR_CONTROL_HANDLERS: Record<string, CommandHandler> = {
  'emulator focus': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    if (!target.worktree) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Emulator focus requires a workspace target.'
      )
    }
    const response = await client.call('emulator.focus', { worktree: target.worktree })
    printResult(response, json, (result) => JSON.stringify(result))
  },
  'emulator key': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const params = EmulatorControlParams.safeParse({
      worktree: target.worktree,
      events: [{ type: 'key', key: getRequiredStringFlag(flags, 'key'), shift: flags.has('shift') }]
    })
    if (!params.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Emulator key input requires a workspace target and supported key.'
      )
    }
    const response = await client.call('emulator.control', params.data)
    printResult(response, json, () => 'Emulator key sent')
  },
  'emulator control': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const { text } = await getComputerTextActionFlags(flags)
    let events: unknown
    try {
      events = JSON.parse(text)
    } catch {
      throw new RuntimeClientError('invalid_argument', 'Control input must be a JSON event array.')
    }
    const params = EmulatorControlParams.safeParse({ worktree: target.worktree, events })
    if (!params.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Invalid emulator control events or duration; a workspace target is required.'
      )
    }
    const response = await client.call('emulator.control', params.data, { timeoutMs: 65000 })
    printResult(response, json, () => 'Emulator control sequence completed')
  }
}
