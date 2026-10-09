import { OrcaYamlTrustViewerParams } from '../../shared/rpc-contract/orca-yaml-trust-viewer-params'
import { OrcaYamlTrustViewerResultSchema } from '../../shared/orca-yaml-trust-viewer-command'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, rejectValuelessFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

function handler(operation: 'get' | 'skip'): CommandHandler {
  return async ({ client, flags, json }) => {
    // Why: an empty value must reach validation, not read as no guard and skip whichever prompt is open.
    const repoId = flags.get('repo')
    const scriptKind = flags.get('script-kind')
    rejectValuelessFlag(repoId, 'repo')
    rejectValuelessFlag(scriptKind, 'script-kind')
    const parsed = OrcaYamlTrustViewerParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...(typeof repoId === 'string' ? { repoId } : {}),
      ...(typeof scriptKind === 'string' ? { scriptKind } : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host and, for skip, a --repo id and --script-kind from get.'
      )
    }
    try {
      const response = await client.call('ui.orcaYamlTrustViewer', parsed.data)
      const result = OrcaYamlTrustViewerResultSchema.parse(response.result)
      printResult({ ...response, result }, json, (value) => JSON.stringify(value))
    } catch (error) {
      // Why: the request already passed this schema, so a host that rejects a skip as invalid predates it.
      if (
        error instanceof RuntimeClientError &&
        (error.code === 'method_not_found' ||
          (operation === 'skip' && error.code === 'invalid_argument'))
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'Update the target runtime to use orca.yaml trust commands.'
        )
      }
      throw error
    }
  }
}
export const ORCA_YAML_TRUST_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'ui orca-yaml-trust get': handler('get'),
  'ui orca-yaml-trust skip': handler('skip')
}
