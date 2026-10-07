type ToggleSidebarPatch = { sidebarOpen: boolean } | { floatingSidebarRevealed: boolean }

// Why: floating mode toggles only the transient overlay so the persisted pinned sidebarOpen value is never rewritten by it.
export function resolveToggleSidebarPatch(input: {
  sidebarOpen: boolean
  floating: boolean
  revealed: boolean
}): ToggleSidebarPatch {
  return input.floating
    ? { floatingSidebarRevealed: !input.revealed }
    : { sidebarOpen: !input.sidebarOpen }
}
