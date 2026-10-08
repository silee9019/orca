import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag } from '../flags'
import { printResult } from '../format'
import { getEmulatorCommandTarget } from '../selectors'
import { RuntimeClientError } from '../runtime-client'

type EmulatorAttachResult = {
  info?: {
    deviceUdid?: string
    streamUrl?: string
  }
  deviceUdid?: string
  streamUrl?: string
}

export const emulatorAttachHandler: CommandHandler = async ({ flags, client, cwd, json }) => {
  const target = await getEmulatorCommandTarget(flags, cwd, client)
  const device = getOptionalStringFlag(flags, 'device')
  const focus = flags.get('focus') === true
  if (focus && !target.worktree) {
    throw new RuntimeClientError('invalid_argument', '--focus requires a workspace target.')
  }
  // Why: attach may cold-boot or recycle a wedged simulator (shutdown + boot +
  // helper restart), which can legitimately exceed the 60s default budget.
  const res = await client.call<EmulatorAttachResult>(
    'emulator.attach',
    { device, worktree: target.worktree, focus },
    { timeoutMs: 180_000 }
  )
  if (focus) {
    await client.call('emulator.focus', { worktree: target.worktree })
  }
  printResult(res, json, (result) => {
    const info = result.info ?? result
    const udid = info?.deviceUdid || device || 'default emulator'
    const stream = info?.streamUrl
    return `Attached to ${udid}${stream ? ` (preview: ${stream})` : ''}`
  })
}
