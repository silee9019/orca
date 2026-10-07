// Why: floating mode overlays the sidebar, so chrome that reserves room for a collapsed sidebar must treat it as collapsed even though the pinned sidebarOpen value stays true.
export function isSidebarInLayoutFlow(state: {
  sidebarOpen: boolean
  settings: { floatingSidebar?: boolean } | null
}): boolean {
  return state.sidebarOpen && state.settings?.floatingSidebar !== true
}
