import type { HandlerGroup } from './handler-group-manifest'

export const WORKSPACE_PROVIDER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-github-issue',
    keys: [
      'github issue',
      'github create-issue',
      'github update-issue',
      'github add-issue-comment'
    ],
    load: async () =>
      (await import('./handlers/workspace-github-issue.js')).WORKSPACE_GITHUB_ISSUE_HANDLERS
  },
  {
    name: 'workspace-github-review',
    keys: [
      'github update-pr-title',
      'github update-pr',
      'github merge-pr',
      'github set-pr-auto-merge',
      'github update-pr-state',
      'github mark-pr-ready-for-review',
      'github request-pr-reviewers',
      'github remove-pr-reviewers',
      'github add-pr-review-comment',
      'github add-pr-review-comment-reply'
    ],
    load: async () =>
      (await import('./handlers/workspace-github-review.js')).WORKSPACE_GITHUB_REVIEW_HANDLERS
  },
  {
    name: 'workspace-github-review-read',
    keys: [
      'github pr-for-branch',
      'github pr-checks',
      'github pr-check-details',
      'github rerun-pr-checks',
      'github pr-comments',
      'github set-pr-comment-reaction',
      'github pr-file-contents',
      'github resolve-review-thread',
      'github set-pr-file-viewed'
    ],
    load: async () =>
      (await import('./handlers/workspace-github-review-read.js'))
        .WORKSPACE_GITHUB_REVIEW_READ_HANDLERS
  },
  {
    name: 'workspace-github-work-items',
    keys: [
      'github repo-slug',
      'github repo-upstream',
      'github rate-limit',
      'github list-work-items',
      'github list-issues',
      'github count-work-items',
      'github list-labels',
      'github list-assignable-users',
      'github work-item',
      'github work-item-by-owner-repo',
      'github work-item-details',
      'github list-bindable-accounts',
      'github validate-account-binding'
    ],
    load: async () =>
      (await import('./handlers/workspace-github-work-items.js'))
        .WORKSPACE_GITHUB_WORK_ITEMS_HANDLERS
  },
  {
    name: 'workspace-github-project',
    keys: [
      'github project list-accessible',
      'github project list-labels-by-slug',
      'github project list-assignable-users-by-slug',
      'github project list-issue-types-by-slug',
      'github project resolve-ref',
      'github project list-views',
      'github project view-table',
      'github project work-item-details-by-slug',
      'github project update-item-field',
      'github project clear-item-field',
      'github project update-issue-by-slug',
      'github project update-pull-request-by-slug',
      'github project update-issue-type-by-slug',
      'github project add-issue-comment-by-slug',
      'github project update-issue-comment-by-slug',
      'github project delete-issue-comment-by-slug'
    ],
    load: async () =>
      (await import('./handlers/workspace-github-project.js')).WORKSPACE_GITHUB_PROJECT_HANDLERS
  },
  {
    name: 'workspace-gitlab',
    keys: [
      'gitlab list-mrs',
      'gitlab list-work-items',
      'gitlab list-issues',
      'gitlab todos',
      'gitlab diagnose-auth',
      'gitlab rate-limit',
      'gitlab list-labels',
      'gitlab create-issue',
      'gitlab update-issue',
      'gitlab add-issue-comment',
      'gitlab add-mr-comment',
      'gitlab add-mr-inline-comment',
      'gitlab resolve-mr-discussion',
      'gitlab job-trace',
      'gitlab retry-job',
      'gitlab merge-mr',
      'gitlab update-mr-state',
      'gitlab update-mr',
      'gitlab update-mr-reviewers',
      'gitlab work-item-details',
      'gitlab work-item-by-path'
    ],
    load: async () => (await import('./handlers/workspace-gitlab.js')).WORKSPACE_GITLAB_HANDLERS
  },
  {
    name: 'workspace-jira',
    keys: [
      'jira status',
      'jira read-status',
      'jira search-issues',
      'jira list-issues',
      'jira get-issue',
      'jira lookup-issue-summary',
      'jira create-issue',
      'jira update-issue',
      'jira add-issue-comment',
      'jira issue-comments',
      'jira list-projects',
      'jira list-issue-types',
      'jira list-create-fields',
      'jira list-priorities',
      'jira list-assignable-users',
      'jira list-project-assignable-users',
      'jira search-users',
      'jira list-transitions',
      'jira get-project-status-order'
    ],
    load: async () => (await import('./handlers/workspace-jira.js')).WORKSPACE_JIRA_HANDLERS
  },
  {
    name: 'workspace-linear-data',
    keys: [
      'linear create-issue',
      'linear update-issue',
      'linear add-issue-comment',
      'linear get-issue',
      'linear list-workspace-issues',
      'linear search-issues',
      'linear list-projects',
      'linear list-teams',
      'linear team-states',
      'linear team-labels',
      'linear team-members',

      'linear issue-comments',
      'linear project get',
      'linear project create',
      'linear list-project-issues',
      'linear list-custom-views',
      'linear get-custom-view',
      'linear list-custom-view-issues',
      'linear list-custom-view-projects'
    ],
    load: async () =>
      (await import('./handlers/workspace-linear-data.js')).WORKSPACE_LINEAR_DATA_HANDLERS
  },
  {
    name: 'workspace-integrations',
    keys: [
      'jira connect',
      'linear connect',
      'jira disconnect',
      'linear disconnect',
      'jira select-site',
      'linear select-workspace',
      'linear connection-status',
      'linear test-connection',
      'jira test-connection'
    ],
    load: async () =>
      (await import('./handlers/workspace-integrations.js')).WORKSPACE_INTEGRATION_HANDLERS
  },
  {
    name: 'workspace-bitbucket',
    keys: ['bitbucket connect', 'bitbucket disconnect', 'bitbucket status'],
    load: async () =>
      (await import('./handlers/workspace-bitbucket.js')).WORKSPACE_BITBUCKET_HANDLERS
  },
  {
    name: 'workspace-hosted-review',
    keys: ['review for-branch', 'review eligibility', 'review create', 'review create-stacked'],
    load: async () =>
      (await import('./handlers/workspace-hosted-review.js')).WORKSPACE_HOSTED_REVIEW_HANDLERS
  }
]
