import { defineMethod } from '../core'
import {
  EmulatorControlParams,
  EmulatorFocusParams
} from '../../../../shared/rpc-contract/emulator-control-params'
import { sendEmulatorControlSequence } from '../../../emulator/emulator-control-sequence'

export const EMULATOR_CONTROL_METHODS = [
  defineMethod({
    name: 'emulator.focus',
    params: EmulatorFocusParams,
    handler: (params, { runtime, signal }) => runtime.emulatorFocus(params, signal)
  }),
  defineMethod({
    name: 'emulator.control',
    params: EmulatorControlParams,
    handler: async (params, context) => {
      const session = await context.runtime.emulatorStreamInfo(params)
      const signal = context.signal ?? new AbortController().signal
      await sendEmulatorControlSequence(session.wsUrl, params.events, signal)
      return { ok: true, deviceId: session.deviceUdid, cancelled: signal.aborted }
    }
  })
]
