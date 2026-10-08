import type { DesktopGitHubRefreshServices } from '../../../github-desktop-refresh-handlers'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { DesktopGitHubRefresh } from '../../../../shared/rpc-contract/workspace-github-refresh-params'
import { defineMethod } from '../core'
let services: DesktopGitHubRefreshServices | null = null
export function setDesktopGitHubRefreshForRpc(value: DesktopGitHubRefreshServices | null): void {
  services = value
}
function requireServices(): DesktopGitHubRefreshServices {
  if (!services) {
    throw new Error('runtime_unavailable')
  }
  return services
}
function candidate(
  params: { repoId: string; branch: string; expectedRepoHostId: string },
  service: DesktopGitHubRefreshServices
) {
  const repo = service.getRepo(params.repoId)
  if (
    !repo ||
    repo.kind === 'folder' ||
    getRepoExecutionHostId(repo) !== params.expectedRepoHostId
  ) {
    throw new Error('Registered GitHub repository or host mismatch.')
  }
  if (getRepoExecutionHostId(repo) !== (repo.connectionId ? `ssh:${repo.connectionId}` : 'local')) {
    throw new Error('Repository owner requires a direct runtime-host route.')
  }
  return {
    cacheKey: `cli:${repo.id}:${params.branch}`,
    repoId: repo.id,
    repoPath: repo.path,
    repoKind: 'git' as const,
    branch: params.branch
  }
}
export const WORKSPACE_GITHUB_REFRESH_METHODS = [
  defineMethod({
    name: 'github.refreshDesktopPRNow',
    params: DesktopGitHubRefresh,
    handler: async (params) => {
      const service = requireServices()
      try {
        const outcome = await service.refresh({
          candidate: candidate(params, service),
          reason: 'manual'
        })
        if (outcome.kind === 'upstream-error') {
          return {
            kind: outcome.kind,
            errorType: outcome.errorType,
            message: 'GitHub refresh did not complete; check the selected owner diagnostics.',
            fetchedAt: outcome.fetchedAt,
            ...(outcome.nextAutoRetryAt !== undefined
              ? { nextAutoRetryAt: outcome.nextAutoRetryAt }
              : {}),
            ...(outcome.retryDisabledUntil !== undefined
              ? { retryDisabledUntil: outcome.retryDisabledUntil }
              : {})
          }
        }
        return outcome
      } catch {
        throw new Error('Desktop GitHub refresh failed.')
      }
    }
  }),
  defineMethod({
    name: 'github.enqueueDesktopPRRefresh',
    params: DesktopGitHubRefresh,
    handler: (params) => {
      const service = requireServices()
      try {
        return service.enqueue({ candidate: candidate(params, service), reason: 'manual' })
      } catch {
        throw new Error('Desktop GitHub refresh enqueue failed.')
      }
    }
  })
]
