import { RuntimeClientError, RuntimeRpcFailureError } from './runtime-client'
import type { RuntimeRpcSuccess } from './runtime-client'

export async function callSettings<TResult>(call: () => Promise<RuntimeRpcSuccess<TResult>>) {
  try {
    return await call()
  } catch (error) {
    if (error instanceof RuntimeRpcFailureError && error.code === 'method_not_found') {
      throw new RuntimeClientError(
        'update_required',
        'Update Orca on the selected runtime to use safe settings control.'
      )
    }
    throw error
  }
}
