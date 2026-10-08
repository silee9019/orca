import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredFiniteNumber, getOptionalNumberFlag } from '../flags'
import { printResult } from '../format'
import { getEmulatorCommandTarget } from '../selectors'
import { RuntimeClientError } from '../runtime-client'
import { EmulatorControlParams } from '../../shared/rpc-contract/emulator-control-params'
import { getComputerTextActionFlags } from './computer-action-flags'
import { EmulatorFrameParams } from '../../shared/emulator-frame-command'

export const EMULATOR_CONTROL_HANDLERS: Record<string, CommandHandler> = {
  'emulator pointer-view': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const params = EmulatorFrameParams.parse({
      worktree: target.worktree,
      tabId: getRequiredStringFlag(flags, 'tab-id'),
      action: {
        type: 'pointer',
        points: JSON.parse((await getComputerTextActionFlags(flags)).text)
      }
    })
    const result = await client.call('emulator.pointerView', params)
    printResult(result, json, (value) => JSON.stringify(value))
  },
  'emulator session-view': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const action = getRequiredStringFlag(flags, 'action')
    if (action !== 'attach' && action !== 'shutdown') {
      throw new RuntimeClientError('invalid_argument', 'Session action must be attach or shutdown.')
    }
    const params = EmulatorFrameParams.parse({
      worktree: target.worktree,
      tabId: getRequiredStringFlag(flags, 'tab-id'),
      action: {
        type: action === 'attach' ? 'attach-view' : 'shutdown-view',
        device: getRequiredStringFlag(flags, 'device')
      }
    })
    const result = await client.call('emulator.sessionView', params)
    printResult(result, json, (value) => JSON.stringify(value))
  },
  'emulator focus-group': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const params = EmulatorFrameParams.parse({
      worktree: target.worktree,
      tabId: getRequiredStringFlag(flags, 'tab-id'),
      action: { type: 'focus-group', groupId: getRequiredStringFlag(flags, 'group-id') }
    })
    const result = await client.call('emulator.focusGroup', params)
    printResult(result, json, (value) => JSON.stringify(value))
  },
  'emulator select-tab': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const params = EmulatorFrameParams.parse({
      worktree: target.worktree,
      tabId: getRequiredStringFlag(flags, 'tab-id'),
      action: {
        type: 'select-tab',
        executionHostId: getRequiredStringFlag(flags, 'execution-host')
      }
    })
    const result = await client.call('emulator.selectTab', params)
    printResult(result, json, (value) => JSON.stringify(value))
  },
  'emulator screen-key': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const params = EmulatorFrameParams.parse({
      worktree: target.worktree,
      tabId: getRequiredStringFlag(flags, 'tab-id'),
      action: { type: 'key', key: getRequiredStringFlag(flags, 'key'), shift: flags.has('shift') }
    })
    const result = await client.call('emulator.screenKey', params)
    printResult(result, json, (value) => JSON.stringify(value))
  },
  'emulator screen-paste': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const params = EmulatorFrameParams.parse({
      worktree: target.worktree,
      tabId: getRequiredStringFlag(flags, 'tab-id'),
      action: { type: 'paste', text: (await getComputerTextActionFlags(flags)).text }
    })
    const result = await client.call('emulator.screenPaste', params)
    printResult(result, json, (value) => JSON.stringify(value))
  },
  'emulator rotate-view': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const params = EmulatorFrameParams.parse({
      worktree: target.worktree,
      tabId: getRequiredStringFlag(flags, 'tab-id'),
      action: { type: 'rotate' }
    })
    const result = await client.call('emulator.rotateView', params)
    printResult(result, json, (value) => JSON.stringify(value))
  },
  'emulator wheel': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const params = EmulatorFrameParams.safeParse({
      worktree: target.worktree,
      tabId: getRequiredStringFlag(flags, 'tab-id'),
      action: {
        type: 'wheel',
        clientX: getRequiredFiniteNumber(flags, 'x'),
        clientY: getRequiredFiniteNumber(flags, 'y'),
        deltaX: getOptionalNumberFlag(flags, 'delta-x') ?? 0,
        deltaY: getRequiredFiniteNumber(flags, 'delta-y'),
        deltaMode: getOptionalNumberFlag(flags, 'delta-mode') ?? 0
      }
    })
    if (!params.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid emulator wheel input or target.')
    }
    const result = await client.call('emulator.wheel', params.data)
    printResult(result, json, (value) => JSON.stringify(value))
  },
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
