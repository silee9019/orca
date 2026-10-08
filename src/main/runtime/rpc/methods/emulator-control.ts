import { defineMethod } from '../core'
import {
  EmulatorControlParams,
  EmulatorFocusParams
} from '../../../../shared/rpc-contract/emulator-control-params'
import { sendEmulatorControlSequence } from '../../../emulator/emulator-control-sequence'
import {
  EmulatorWheelParams,
  EmulatorScreenKeyParams,
  EmulatorScreenPasteParams,
  EmulatorRotateViewParams,
  EmulatorFocusGroupParams,
  EmulatorSelectTabParams,
  EmulatorSessionViewParams,
  EmulatorPointerViewParams
} from '../../../../shared/emulator-frame-command'

export const EMULATOR_CONTROL_METHODS = [
  defineMethod({
    name: 'emulator.pointerView',
    params: EmulatorPointerViewParams,
    handler: (params, { runtime, signal }) => runtime.emulatorFrame(params, signal)
  }),
  defineMethod({
    name: 'emulator.sessionView',
    params: EmulatorSessionViewParams,
    handler: (params, { runtime, signal }) => runtime.emulatorFrame(params, signal)
  }),
  defineMethod({
    name: 'emulator.focusGroup',
    params: EmulatorFocusGroupParams,
    handler: (params, { runtime, signal }) => runtime.emulatorFrame(params, signal)
  }),
  defineMethod({
    name: 'emulator.selectTab',
    params: EmulatorSelectTabParams,
    handler: (params, { runtime, signal }) => runtime.emulatorFrame(params, signal)
  }),
  defineMethod({
    name: 'emulator.screenKey',
    params: EmulatorScreenKeyParams,
    handler: (params, { runtime, signal }) => runtime.emulatorFrame(params, signal)
  }),
  defineMethod({
    name: 'emulator.screenPaste',
    params: EmulatorScreenPasteParams,
    handler: (params, { runtime, signal }) => runtime.emulatorFrame(params, signal)
  }),
  defineMethod({
    name: 'emulator.rotateView',
    params: EmulatorRotateViewParams,
    handler: (params, { runtime, signal }) => runtime.emulatorFrame(params, signal)
  }),

  defineMethod({
    name: 'emulator.wheel',
    params: EmulatorWheelParams,
    handler: (params, { runtime, signal }) => runtime.emulatorFrame(params, signal)
  }),
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
