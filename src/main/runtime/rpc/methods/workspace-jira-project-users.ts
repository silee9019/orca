import { defineMethod } from '../core'
import { listAssignableUsersForProject } from '../../../jira/jira-issue-create-metadata'
import { JiraProjectAssignableUsers } from '../../../../shared/rpc-contract/workspace-jira-project-users-params'

export const WORKSPACE_JIRA_PROJECT_USER_METHODS = [
  defineMethod({
    name: 'jira.listAssignableUsersForProject',
    params: JiraProjectAssignableUsers,
    handler: (params) =>
      listAssignableUsersForProject(params.projectIdOrKey, params.query, params.siteId)
  })
]
