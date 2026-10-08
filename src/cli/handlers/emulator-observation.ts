import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getOptionalPositiveIntegerFlag, getRequiredStringFlag } from '../flags'
import { getEmulatorCommandTarget } from '../selectors'
import { RuntimeClientError } from '../runtime-client'

const emulatorStreamHandler: CommandHandler = async ({ flags, client, cwd }) => {
  const target = await getEmulatorCommandTarget(flags, cwd, client)
  if (!target.worktree) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Emulator streaming requires a workspace target'
    )
  }
  const timeoutMs = getOptionalPositiveIntegerFlag(flags, 'timeout-ms') ?? 10_000
  if (timeoutMs > 60_000) {
    throw new RuntimeClientError('invalid_argument', '--timeout-ms must not exceed 60000')
  }
  const codec = getRequiredStringFlag(flags, 'codec')
  if (codec !== 'mjpeg' && codec !== 'h264') {
    throw new RuntimeClientError('invalid_argument', '--codec must be mjpeg or h264')
  }
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)
  try {
    await client.consumeEmulatorStream(
      codec === 'mjpeg' ? 'emulator.startFrameStream' : 'emulator.startVideoStream',
      { worktree: target.worktree, timeoutMs },
      (result) => console.log(JSON.stringify(result)),
      controller.signal
    )
  } finally {
    process.removeListener('SIGINT', abort)
    process.removeListener('SIGTERM', abort)
  }
}

export const EMULATOR_OBSERVATION_HANDLERS: Record<string, CommandHandler> = {
  'emulator stream': emulatorStreamHandler,
  'emulator observe': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    if (!target.worktree) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Emulator observation requires a workspace target'
      )
    }
    const timeoutMs = getOptionalPositiveIntegerFlag(flags, 'timeout-ms') ?? 10_000
    if (timeoutMs > 60_000) {
      throw new RuntimeClientError('invalid_argument', '--timeout-ms must not exceed 60000')
    }
    const res = await client.call(
      'emulator.observe',
      { worktree: target.worktree, timeoutMs },
      { timeoutMs: timeoutMs + 5_000 }
    )
    printResult(res, json, (value) => JSON.stringify(value, null, 2))
  },
  'emulator availability': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const res = await client.call('emulator.availability', { worktree: target.worktree })
    printResult(res, json, (value) => JSON.stringify(value, null, 2))
  },
  'emulator simulators': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const res = await client.call('emulator.listSimulators', { worktree: target.worktree })
    printResult(res, json, (value) => JSON.stringify(value, null, 2))
  },
  'emulator detach': async ({ flags, client, cwd, json }) => {
    const target = await getEmulatorCommandTarget(flags, cwd, client)
    const res = await client.call('emulator.unregisterActive', { worktree: target.worktree })
    printResult(res, json, () => 'Detached emulator from workspace')
  }
}
