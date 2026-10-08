import type { AppState } from '@/store/types'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'

export function applyActivityListPreferenceCommand(
  command: ActivityViewerCommand,
  state: Pick<
    AppState,
    'setAgentsGroupBy' | 'setAgentsReadFilter' | 'setAgentsCompactMode' | 'setAgentsShowChildAgents'
  >
): Promise<void> | undefined {
  if (command.operation === 'group') {
    return state.setAgentsGroupBy(command.by)
  }
  if (command.operation === 'read') {
    return state.setAgentsReadFilter(command.filter)
  }
  if (command.operation === 'compact') {
    return state.setAgentsCompactMode(command.enabled)
  }
  if (command.operation === 'children') {
    return state.setAgentsShowChildAgents(command.enabled)
  }
  return undefined
}
