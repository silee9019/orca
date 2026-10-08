import type { z } from 'zod'
import { RepoHostGitUsername } from '../../../../shared/rpc-contract/workspace-repo-username-params'
import { defineMethod } from '../core'

type ReadUsername = (params: z.infer<typeof RepoHostGitUsername>) => Promise<string>
let readUsername: ReadUsername | null = null

export function setRepoGitUsernameReaderForRpc(reader: ReadUsername | null): void {
  readUsername = reader
}

export const WORKSPACE_REPO_USERNAME_METHODS = [
  defineMethod({
    name: 'repo.gitUsernameForHost',
    params: RepoHostGitUsername,
    handler: (params) => {
      if (!readUsername) {
        throw new Error('runtime_unavailable')
      }
      return readUsername(params)
    }
  })
]
