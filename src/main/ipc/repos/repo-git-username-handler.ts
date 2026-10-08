import { ipcMain } from 'electron'
import type { Repo } from '../../../shared/repo-types'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { isWslUncPath } from '../../../shared/wsl-paths'
import { getRepoForExecutionHost } from '../../repo-execution-host-selection'
import { setRepoGitUsernameReaderForRpc } from '../../runtime/rpc/methods/workspace-repo-username'
import type { Store } from '../../persistence'
import { isFolderRepo } from '../../../shared/repo-kind'
import { getSshGitProvider } from '../../providers/ssh-git-dispatch'
import { getSshGitUsername, resolveLocalGitUsername } from '../../git/git-username'

export function registerRepoGitUsernameHandler(store: Store): void {
  const readRepoUsername = async (repo: Repo | undefined | null): Promise<string> => {
    if (!repo || isFolderRepo(repo)) {
      return ''
    }
    // Why: remote repos keep their git config on the remote host, so resolve the username there.
    if (repo.connectionId) {
      const provider = getSshGitProvider(repo.connectionId)
      if (!provider) {
        return ''
      }
      return getSshGitUsername(provider, repo.path)
    }
    return resolveLocalGitUsername(repo.path)
  }
  ipcMain.handle('repos:getGitUsername', (_event, args: { repoId: string }) =>
    readRepoUsername(store.getRepo(args.repoId))
  )
  setRepoGitUsernameReaderForRpc(async (args) => {
    if (parseExecutionHostId(args.hostId)?.kind === 'runtime') {
      throw new Error('Select the owning Git environment.')
    }
    const repo = getRepoForExecutionHost(store, args.repoId, args.hostId)
    if (!repo) {
      throw new Error('selector_not_found')
    }
    if (!repo.connectionId && isWslUncPath(repo.path)) {
      throw new Error('Select the owning Git environment.')
    }
    try {
      return await readRepoUsername(repo)
    } catch {
      throw new Error('Desktop Git username lookup failed.')
    }
  })
}
