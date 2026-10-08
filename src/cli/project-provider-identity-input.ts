import { ProjectProviderIdentity } from '../shared/rpc-contract/project-runtime-params'
import type { ProjectHostSetupExistingFolderArgs } from '../shared/project-types'
import { getOptionalStringFlag } from './flags'
import { RuntimeClientError } from './runtime-client'

export function readProjectProviderIdentity(flags: Map<string, string | boolean>) {
  const owner = getOptionalStringFlag(flags, 'project-owner')
  const repo = getOptionalStringFlag(flags, 'project-repo')
  const host = getOptionalStringFlag(flags, 'project-provider-host')
  if (owner === undefined && repo === undefined && host === undefined) {
    return undefined
  }
  const parsed = ProjectProviderIdentity.safeParse({ provider: 'github', owner, repo, host })
  if (!parsed.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Project identity requires --project-owner and --project-repo; --project-provider-host is optional'
    )
  }
  return parsed.data
}

export function readProjectImportMethod(
  flags: Map<string, string | boolean>
): ProjectHostSetupExistingFolderArgs['setupMethod'] {
  const method = getOptionalStringFlag(flags, 'method')
  if (method === undefined || method === 'imported-existing-folder' || method === 'cloned') {
    return method
  }
  throw new RuntimeClientError(
    'invalid_argument',
    '--method must be imported-existing-folder or cloned'
  )
}
