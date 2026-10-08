import { printResult } from './format'
import { RuntimeClientError, type RuntimeRpcSuccess } from './runtime-client'

export function printWorkspaceCommandResult<TResult>(
  response: RuntimeRpcSuccess<TResult>,
  json: boolean,
  formatter: (value: TResult) => string
): void {
  const result = response.result
  if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
    throw new RuntimeClientError(
      'operation_failed',
      'The selected host reported that the operation failed.'
    )
  }
  printResult(response, json, formatter)
}
