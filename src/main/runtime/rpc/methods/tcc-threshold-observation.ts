import { defineStreamingMethod } from '../core'
import {
  getTccPromptNoticeStatus,
  observeTccPromptThreshold
} from '../../../macos-tcc-prompt-notice'
export const TCC_THRESHOLD_OBSERVATION_METHODS = [
  defineStreamingMethod({
    name: 'macosTccPrompts.observeThreshold',
    params: null,
    handler: async (_, { signal }, emit) => {
      if (signal?.aborted) {
        return
      }
      if (process.platform !== 'darwin') {
        throw new Error('TCC threshold observation is unsupported on this platform')
      }
      await new Promise<void>((resolve) => {
        const unsubscribe = observeTccPromptThreshold((payload) =>
          emit({ type: 'threshold', ...payload })
        )
        const finish = () => {
          unsubscribe()
          signal?.removeEventListener('abort', finish)
          resolve()
        }
        signal?.addEventListener('abort', finish, { once: true })
        try {
          emit({ type: 'ready', ...getTccPromptNoticeStatus() })
        } catch (error) {
          finish()
          throw error
        }
        if (signal?.aborted) {
          finish()
        }
      })
    }
  })
]
