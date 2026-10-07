export type SidebarPresentation = 'pinned' | 'collapsed' | 'hover-overlay'

// Why: sidebarOpen stays the single pinned-state source; floating only adds a hover overlay while it is false.
export function resolveSidebarPresentation(input: {
  floatingSidebar: boolean
  sidebarOpen: boolean
}): SidebarPresentation {
  if (input.sidebarOpen) {
    return 'pinned'
  }
  return input.floatingSidebar ? 'hover-overlay' : 'collapsed'
}
