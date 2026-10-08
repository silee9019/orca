import { AGENT_STATUS_WATCH_COMMAND_SPECS } from './specs/agent-status-watch'
import { STRUCTURED_HELD_WATCH_COMMAND_SPECS } from './specs/structured-held-watch'
import { REMOTE_WORKSPACE_WATCH_COMMAND_SPECS } from './specs/remote-workspace-watch'
import { AGENT_AWAKE_WATCH_COMMAND_SPECS } from './specs/agent-awake-watch'
import { AI_VAULT_LIST_CANCEL_COMMAND_SPECS } from './specs/ai-vault-list-cancel'
import { AGENT_PANE_AUTHORITY_COMMAND_SPECS } from './specs/agent-pane-authority'
import { specPaths } from './args'
import { AGENT_SESSION_COMMAND_SPECS } from './specs/agent-sessions'
import { STRUCTURED_AGENT_SESSION_COMMAND_SPECS } from './specs/structured-agent-sessions'
import { AGENT_STATUS_COMMAND_SPECS } from './specs/agent-status'
import { CODEX_PANE_SHARED_SERVER_COMMAND_SPECS } from './specs/codex-pane-shared-server'
import { ISSUE_COMMAND_RUNNER_COMMAND_SPECS } from './specs/issue-command-runner'
import { REMOTE_WORKSPACE_READ_COMMAND_SPECS } from './specs/remote-workspace-read'
import { WORKSPACE_REVIEW_CACHE_COMMAND_SPECS } from './specs/workspace-review-cache'
import { WORKSPACE_REVIEW_CACHE_WRITE_COMMAND_SPECS } from './specs/workspace-review-cache-write'
import { NATIVE_CHAT_WATCH_COMMAND_SPECS } from './specs/native-chat-watch'

const runtimeCommands = [
  ...AGENT_STATUS_WATCH_COMMAND_SPECS,
  ...STRUCTURED_HELD_WATCH_COMMAND_SPECS,
  ...REMOTE_WORKSPACE_WATCH_COMMAND_SPECS,
  ...AGENT_AWAKE_WATCH_COMMAND_SPECS,
  ...AI_VAULT_LIST_CANCEL_COMMAND_SPECS,
  ...AGENT_PANE_AUTHORITY_COMMAND_SPECS,
  ...AGENT_SESSION_COMMAND_SPECS,
  ...STRUCTURED_AGENT_SESSION_COMMAND_SPECS,
  ...AGENT_STATUS_COMMAND_SPECS,
  ...CODEX_PANE_SHARED_SERVER_COMMAND_SPECS,
  ...ISSUE_COMMAND_RUNNER_COMMAND_SPECS,
  ...REMOTE_WORKSPACE_READ_COMMAND_SPECS,
  ...WORKSPACE_REVIEW_CACHE_COMMAND_SPECS,
  ...WORKSPACE_REVIEW_CACHE_WRITE_COMMAND_SPECS,
  ...NATIVE_CHAT_WATCH_COMMAND_SPECS
]

export function isSelectedRuntimeAgentCommand(commandPath: readonly string[]): boolean {
  if (commandPath[0] !== 'agent') {
    return false
  }
  const key = commandPath.join(' ')
  return runtimeCommands.some((spec) => specPaths(spec).some((path) => path.join(' ') === key))
}
