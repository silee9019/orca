import { defineMethod } from '../core'
import { JiraCliReadRequests } from '../../../jira-cli-read-requests'
import type { RuntimeJiraCommands } from '../../runtime-jira-commands'
import {
  JiraCliSearchStart,
  JiraCliSummaryStart,
  JiraCliReadRequest
} from '../../../../shared/rpc-contract/workspace-jira-read-params'

const searches = new JiraCliReadRequests<
  Awaited<ReturnType<RuntimeJiraCommands['jiraSearchIssues']>>
>()
const summaries = new JiraCliReadRequests<
  Awaited<ReturnType<RuntimeJiraCommands['jiraLookupIssueSummary']>>
>()
export function disposeJiraCliReads(): void {
  searches.dispose()
  summaries.dispose()
}
export const WORKSPACE_JIRA_READ_METHODS = [
  defineMethod({
    name: 'jira.cliSearchStart',
    params: JiraCliSearchStart,
    handler: (params, { runtime }) =>
      searches.start((signal) =>
        runtime.jiraSearchIssues(params.jql, params.limit, params.siteId, signal)
      )
  }),
  defineMethod({
    name: 'jira.cliSummaryStart',
    params: JiraCliSummaryStart,
    handler: (params, { runtime }) =>
      summaries.start((signal) => runtime.jiraLookupIssueSummary(params.key, params.siteId, signal))
  }),
  defineMethod({
    name: 'jira.cliSearchStatus',
    params: JiraCliReadRequest,
    handler: (params) => searches.status(params.requestId)
  }),
  defineMethod({
    name: 'jira.cliSummaryStatus',
    params: JiraCliReadRequest,
    handler: (params) => summaries.status(params.requestId)
  }),
  defineMethod({
    name: 'jira.cliSearchCancel',
    params: JiraCliReadRequest,
    handler: (params) => searches.cancel(params.requestId)
  }),
  defineMethod({
    name: 'jira.cliSummaryCancel',
    params: JiraCliReadRequest,
    handler: (params) => summaries.cancel(params.requestId)
  })
]
