import { defineStreamingMethod } from '../core'
export const CODEX_LOGIN_OBSERVATION_METHODS = [
  defineStreamingMethod({
    name: 'accounts.observeCodexLogin',
    params: null,
    handler: async (_, { runtime, signal }, emit) => {
      if (signal?.aborted) {
        return
      }
      await new Promise<void>((resolve) => {
        const unsubscribe = runtime.observeCodexLogin((pending, revision) =>
          emit({ type: revision === 0 ? 'ready' : 'changed', pending, revision })
        )
        const finish = () => {
          unsubscribe()
          signal?.removeEventListener('abort', finish)
          resolve()
        }
        signal?.addEventListener('abort', finish, { once: true })
        if (signal?.aborted) {
          finish()
        }
      })
    }
  })
]
