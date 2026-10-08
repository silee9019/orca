import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_HOSTED_REVIEW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['review', 'for-branch'],
    summary: 'Find the hosted review for a branch',
    usage: 'orca review for-branch --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'The selected runtime resolves the repository and execution host, including SSH. Existing provider detection, permissions, branch status and creation preflight are preserved. GitHub, GitLab, Bitbucket, Azure DevOps and Gitea keep their own provider IDs.',
      'Read JSON from --params-file <file|->. A newer host\u2019s provider token is forwarded unchanged; an unsupported provider or missing old-host method fails explicitly without fallback or retry.',
      'Input fields: repo and branch; optional worktree (eligibility only), base, linkedGitHubPR, linkedGitLabMR, linkedBitbucketPR, linkedAzureDevOpsPR and linkedGiteaPR. The host owns review discovery and creation eligibility; a blocked eligibility is returned as data.'
    ]
  },
  {
    path: ['review', 'eligibility'],
    summary: 'Check review creation eligibility',
    usage: 'orca review eligibility --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'The selected runtime resolves the repository and execution host, including SSH. Existing provider detection, permissions, branch status and creation preflight are preserved. GitHub, GitLab, Bitbucket, Azure DevOps and Gitea keep their own provider IDs.',
      'Read JSON from --params-file <file|->. A newer host\u2019s provider token is forwarded unchanged; an unsupported provider or missing old-host method fails explicitly without fallback or retry.',
      'Input fields: repo and branch; optional worktree (eligibility only), base, linkedGitHubPR, linkedGitLabMR, linkedBitbucketPR, linkedAzureDevOpsPR and linkedGiteaPR. The host owns review discovery and creation eligibility; a blocked eligibility is returned as data.'
    ]
  },
  {
    path: ['review', 'create'],
    summary: 'Publish a hosted review after branch and provider checks',
    usage: 'orca review create --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'The selected runtime resolves the repository and execution host, including SSH. Existing provider detection, permissions, branch status and creation preflight are preserved. GitHub, GitLab, Bitbucket, Azure DevOps and Gitea keep their own provider IDs.',
      'Read JSON from --params-file <file|->. A newer host\u2019s provider token is forwarded unchanged; an unsupported provider or missing old-host method fails explicitly without fallback or retry.',
      'Input fields: repo, provider, base, title; optional worktree, head, body, draft and useTemplate. --confirm must equal repo:provider:head:base. Use current in place of head when it is omitted. The host checks the selected branch and review creation eligibility again before publishing.'
    ],
    destructive: true
  },
  {
    path: ['review', 'create-stacked'],
    summary: 'Publish a stacked review through the existing provider service',
    usage: 'orca review create-stacked --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'The selected runtime resolves the repository and execution host, including SSH. Existing provider detection, permissions, branch status and creation preflight are preserved. GitHub, GitLab, Bitbucket, Azure DevOps and Gitea keep their own provider IDs.',
      'Read JSON from --params-file <file|->. A newer host\u2019s provider token is forwarded unchanged; an unsupported provider or missing old-host method fails explicitly without fallback or retry.',
      'Input fields: repo, provider, base, title; optional worktree, head, body, draft and useTemplate. --confirm must equal repo:provider:head:base. Use current in place of head when it is omitted. The host checks the selected branch and review creation eligibility again before publishing.'
    ],
    destructive: true
  }
]
