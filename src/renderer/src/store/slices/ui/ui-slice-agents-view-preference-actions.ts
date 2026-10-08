import type { UISlice, UISliceSet } from './ui-slice-contract'
import {
  DEFAULT_AGENTS_GROUP_BY,
  DEFAULT_AGENTS_READ_FILTER
} from '../../../../../shared/agents-view-thread-filters'
import { normalizeVisibleExecutionHostIds } from '../../../../../shared/execution-host'

/** Agents-view preferences; each setter persists immediately and stays separate from workspace-nav state. */
export function createAgentsViewPreferenceActions(set: UISliceSet): Partial<UISlice> {
  return {
    agentsVisibleHostIds: null,
    setAgentsVisibleHostIds: (ids) => {
      const agentsVisibleHostIds = normalizeVisibleExecutionHostIds(ids)
      set({ agentsVisibleHostIds })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({ agentsVisibleHostIds })
      void saving.catch(console.error)
      return saving
    },
    agentsFilterRepoIds: [],
    setAgentsFilterRepoIds: (ids) => {
      set({ agentsFilterRepoIds: ids })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({
        agentsFilterRepoIds: [...ids]
      })
      void saving.catch(console.error)
      return saving
    },
    agentsHideWorkspacesFromOtherDevices: false,
    setAgentsHideWorkspacesFromOtherDevices: (v) => {
      set({ agentsHideWorkspacesFromOtherDevices: v })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({
        agentsHideWorkspacesFromOtherDevices: v
      })
      void saving.catch(console.error)
      return saving
    },
    agentsHideAutomationGeneratedWorkspaces: false,
    setAgentsHideAutomationGeneratedWorkspaces: (v) => {
      set({ agentsHideAutomationGeneratedWorkspaces: v })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({
        agentsHideAutomationGeneratedWorkspaces: v
      })
      void saving.catch(console.error)
      return saving
    },
    agentsHideCliCreatedWorkspaces: false,
    setAgentsHideCliCreatedWorkspaces: (v) => {
      set({ agentsHideCliCreatedWorkspaces: v })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({
        agentsHideCliCreatedWorkspaces: v
      })
      void saving.catch(console.error)
      return saving
    },
    agentsShowChildAgents: false,
    setAgentsShowChildAgents: (v) => {
      set({ agentsShowChildAgents: v })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({ agentsShowChildAgents: v })
      void saving.catch(console.error)
      return saving
    },
    agentsCompactMode: true,
    setAgentsCompactMode: (v) => {
      set({ agentsCompactMode: v })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({ agentsCompactMode: v })
      void saving.catch(console.error)
      return saving
    },
    agentsShowSearch: true,
    setAgentsShowSearch: (v) => {
      set({ agentsShowSearch: v })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({ agentsShowSearch: v })
      void saving.catch(console.error)
      return saving
    },
    agentsReadFilter: DEFAULT_AGENTS_READ_FILTER,
    setAgentsReadFilter: (v) => {
      set({ agentsReadFilter: v })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({ agentsReadFilter: v })
      void saving.catch(console.error)
      return saving
    },
    agentsGroupBy: DEFAULT_AGENTS_GROUP_BY,
    setAgentsGroupBy: (v) => {
      set({ agentsGroupBy: v })
      const saving = (window.api.ui.setWithAck ?? window.api.ui.set)({ agentsGroupBy: v })
      void saving.catch(console.error)
      return saving
    }
  }
}
