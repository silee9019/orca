import { defineMethod } from '../core'
import { IssueCommandRunnerParams } from '../../../../shared/rpc-contract/issue-command-runner-params'

export const ISSUE_COMMAND_RUNNER_METHODS = [
  defineMethod({
    name: 'hooks.createIssueCommandRunner',
    params: IssueCommandRunnerParams,
    handler: async (params, { runtime }) => ({
      launch: await runtime.createWorkspaceIssueCommandRunner(params.worktree, params.command)
    })
  })
]
