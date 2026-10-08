import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_LINEAR_ISSUE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['linear', 'create-issue'],
    summary: 'Create a Linear issue with explicit IDs',
    usage:
      'orca linear create-issue --params-file <file|-> --confirm <workspaceId:teamId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    destructive: true,
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses CreateIssue fields from the existing Linear RPC contract.',
      'A concrete workspaceId is required; all and missing IDs are rejected. --confirm must exactly match workspaceId:teamId.'
    ]
  },
  {
    path: ['linear', 'update-issue'],
    summary: 'Update Linear issue fields including due date and parent',
    usage: 'orca linear update-issue --params-file <file|-> --confirm <workspaceId:id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    destructive: true,
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses IssueUpdate fields from the existing Linear RPC contract.',
      'A concrete workspaceId is required; all and missing IDs are rejected. --confirm must exactly match workspaceId:id.',
      'dueDate uses YYYY-MM-DD or null to clear; parentId accepts an issue ID or null. Requires the updateIssueFields host method so older schemas cannot silently discard these fields.'
    ]
  },
  {
    path: ['linear', 'add-issue-comment'],
    summary: 'Add a Linear issue comment',
    usage:
      'orca linear add-issue-comment --params-file <file|-> --confirm <workspaceId:issueId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    destructive: true,
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses IssueComment fields from the existing Linear RPC contract.',
      'A concrete workspaceId is required; all and missing IDs are rejected. --confirm must exactly match workspaceId:issueId.'
    ]
  },
  {
    path: ['linear', 'get-issue'],
    summary: 'Read a Linear issue by ID',
    usage: 'orca linear get-issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses IssueId fields from the existing Linear RPC contract.'
    ]
  },
  {
    path: ['linear', 'list-workspace-issues'],
    summary: 'List Linear issues with the original attribute filter',
    usage: 'orca linear list-workspace-issues --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses LegacyListIssues fields from the existing Linear RPC contract.',
      'Preserves filter/limit/workspaceId/attributeFilter from the UI list. The existing linear list-issues command uses the distinct MCP query contract.'
    ]
  },
  {
    path: ['linear', 'search-issues'],
    summary: 'Search Linear issues on the selected runtime',
    usage: 'orca linear search-issues --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses SearchIssues fields from the existing Linear RPC contract.'
    ]
  },
  {
    path: ['linear', 'list-projects'],
    summary: 'List Linear projects with the original refresh option',
    usage: 'orca linear list-projects --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses ListProjects fields from the existing Linear RPC contract.'
    ]
  },
  {
    path: ['linear', 'list-teams'],
    summary: 'List Linear teams on the selected runtime',
    usage: 'orca linear list-teams --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses WorkspaceSelection fields from the existing Linear RPC contract.'
    ]
  },
  {
    path: ['linear', 'team-states'],
    summary: 'Read Linear team states by ID',
    usage: 'orca linear team-states --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses TeamId fields from the existing Linear RPC contract.'
    ]
  },
  {
    path: ['linear', 'team-labels'],
    summary: 'Read Linear team labels by ID',
    usage: 'orca linear team-labels --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses TeamId fields from the existing Linear RPC contract.'
    ]
  },
  {
    path: ['linear', 'team-members'],
    summary: 'Read Linear team members by ID',
    usage: 'orca linear team-members --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns the Linear connection and workspace. SSH child repo accounts are not substituted; old peers fail without local fallback.',
      'Input uses TeamId fields from the existing Linear RPC contract.'
    ]
  }
]
