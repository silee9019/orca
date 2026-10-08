import { defineMethod } from '../core'
import { CliFileWatchRequests } from '../../../cli-file-watch-requests'
import {
  CliFileWatchStart,
  CliFileWatchRequest,
  CliFileWatchStatus
} from '../../../../shared/rpc-contract/workspace-file-watch-params'
const requests = new CliFileWatchRequests()
export function disposeCliFileWatches(): Promise<void> {
  return requests.dispose()
}
export const WORKSPACE_FILE_WATCH_METHODS = [
  defineMethod({
    name: 'files.cliWatchStart',
    params: CliFileWatchStart,
    handler: (params, { runtime }) => requests.start(runtime, params.worktree)
  }),
  defineMethod({
    name: 'files.cliWatchStatus',
    params: CliFileWatchStatus,
    handler: (params) => requests.status(params.requestId, params.afterSequence)
  }),
  defineMethod({
    name: 'files.cliWatchStop',
    params: CliFileWatchRequest,
    handler: (params) => requests.stop(params.requestId)
  })
]
