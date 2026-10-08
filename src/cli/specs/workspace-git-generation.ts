import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GIT_GENERATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['git', 'generate-commit-message'],
    summary: 'Generate a commit message from staged changes on the selected host',
    usage: 'orca git generate-commit-message --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, commitMessageAi (optional), sourceControlAi (optional), sourceControlAiResolvedParams (optional), agentCmdOverrides (optional), defaultTuiAgent (optional), commitMessageDiscoveryHostKey (optional).',
      'Pass GitGenerateCommitMessage JSON in a file or --params-file - for stdin. The selected runtime resolves the worktree and its execution host.',
      'SSH generation uses the remote agent and credentials. Missing providers and old methods fail without local fallback.',
      'Generation returns draft text only; it does not commit, push or create a hosted review.'
    ]
  },
  {
    path: ['git', 'discover-commit-models'],
    summary: 'Discover commit message models on the selected host',
    usage: 'orca git discover-commit-models --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, agentId, agentCmdOverrides (optional).',
      'Pass GitDiscoverCommitMessageModels JSON in a file or --params-file - for stdin. The selected runtime resolves the worktree and its execution host.',
      'SSH generation uses the remote agent and credentials. Missing providers and old methods fail without local fallback.',
      'Discovery returns model metadata only; it does not commit, push or create a hosted review.'
    ]
  },
  {
    path: ['git', 'cancel-commit-message'],
    summary: 'Cancel commit message generation for the selected worktree',
    usage: 'orca git cancel-commit-message --params-file <file|-> --confirm <worktree> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: worktree.',
      'Pass WorktreeSelector JSON in a file or --params-file - for stdin. The selected runtime resolves the worktree and its execution host.',
      'SSH generation uses the remote agent and credentials. Missing providers and old methods fail without local fallback.',
      'Cancellation targets the current generation for this worktree and requires an exact --confirm. Acceptance is not evidence that a disconnected process exited.'
    ]
  },
  {
    path: ['git', 'generate-review-fields'],
    summary: 'Generate hosted review draft fields on the selected host',
    usage: 'orca git generate-review-fields --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: worktree, commitMessageAi (optional), sourceControlAi (optional), sourceControlAiResolvedParams (optional), agentCmdOverrides (optional), defaultTuiAgent (optional), commitMessageDiscoveryHostKey (optional), base, title, body, draft, provider (optional), useTemplate (optional).',
      'Pass GitGeneratePullRequestFields JSON in a file or --params-file - for stdin. The selected runtime resolves the worktree and its execution host.',
      'SSH generation uses the remote agent and credentials. Missing providers and old methods fail without local fallback.',
      'Generation returns draft text only; it does not commit, push or create a hosted review.'
    ]
  },
  {
    path: ['git', 'cancel-review-fields'],
    summary: 'Cancel hosted review field generation for the selected worktree',
    usage: 'orca git cancel-review-fields --params-file <file|-> --confirm <worktree> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: worktree.',
      'Pass WorktreeSelector JSON in a file or --params-file - for stdin. The selected runtime resolves the worktree and its execution host.',
      'SSH generation uses the remote agent and credentials. Missing providers and old methods fail without local fallback.',
      'Cancellation targets the current generation for this worktree and requires an exact --confirm. Acceptance is not evidence that a disconnected process exited.'
    ]
  }
]
