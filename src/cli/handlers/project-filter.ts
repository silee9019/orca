import { ProjectFilterParams } from '../../shared/rpc-contract/project-filter-params'
import type { ProjectFilterResult } from '../../shared/project-filter'
import type { CommandHandler } from '../dispatch'
import { getRepeatedStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'

const handler =
  (operation: 'get' | 'set' | 'clear'): CommandHandler =>
  async ({ client, flags, json }) => {
    const parsed = ProjectFilterParams.safeParse({
      viewer: getRequiredStringFlag(flags, 'viewer'),
      operation,
      ...(operation === 'set' ? { repoIds: getRepeatedStringFlag(flags, 'repo') } : {})
    })
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use --viewer host; set requires at least one --repo <id>.'
      )
    }
    try {
      const response = await client.call<ProjectFilterResult>('ui.projectFilter', parsed.data)
      printResult(
        response,
        json,
        (result) =>
          `viewer=host:${result.viewerId} persisted=${result.persisted} applied=${result.applied}\nprojects=${result.repoIds.join(',') || '(all)'}${result.reason ? `\n${result.reason}` : ''}`
      )
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'Update the selected Orca runtime to use project-filter commands.'
        )
      }
      throw error
    }
  }
export const PROJECT_FILTER_HANDLERS: Record<string, CommandHandler> = {
  'ui project-filter get': handler('get'),
  'ui project-filter set': handler('set'),
  'ui project-filter clear': handler('clear')
}
