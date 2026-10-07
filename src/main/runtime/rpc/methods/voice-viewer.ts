import { defineMethod } from '../core'
import { VoiceViewerParams } from '../../../../shared/voice-viewer'

export const VOICE_VIEWER_METHODS = [
  defineMethod({
    name: 'voice.viewer',
    params: VoiceViewerParams,
    handler: (params, { runtime }) => runtime.voiceViewer(params)
  })
]
