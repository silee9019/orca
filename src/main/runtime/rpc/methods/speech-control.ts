import { SpeechKeySave } from '../../../../shared/rpc-contract/voice-control-params'
import { defineMethod } from '../core'
import { SpeechModelAction } from '../../../../shared/rpc-contract/speech-params'

export const SPEECH_CONTROL_METHODS = [
  defineMethod({
    name: 'speech.models.cancel',
    params: SpeechModelAction,
    handler: (params, { runtime }) => runtime.cancelMobileSpeechDownload(params.modelId)
  }),
  defineMethod({
    name: 'speech.key.status',
    params: null,
    handler: (_params, { runtime }) => runtime.getSpeechKeyStatus()
  }),
  defineMethod({
    name: 'speech.key.save',
    params: SpeechKeySave,
    handler: (params, { runtime }) => runtime.saveSpeechKey(params.apiKey)
  }),
  defineMethod({
    name: 'speech.key.clear',
    params: null,
    handler: (_params, { runtime }) => runtime.clearSpeechKey()
  })
]
