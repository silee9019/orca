export function readActivityWorkspaceDestination(
  workspaceId: string,
  executionHostId: string
): boolean {
  return [...document.querySelectorAll<HTMLElement>('[data-rendered-active-worktree-id]')].some(
    (root) => {
      if (
        root.dataset.renderedActiveWorktreeId !== workspaceId ||
        root.dataset.renderedActiveExecutionHostId !== executionHostId ||
        !root.isConnected
      ) {
        return false
      }
      const bounds = root.getBoundingClientRect()
      if (
        !Number.isFinite(bounds.width) ||
        !Number.isFinite(bounds.height) ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) {
        return false
      }
      for (let element: HTMLElement | null = root; element; element = element.parentElement) {
        const style = getComputedStyle(element)
        if (
          element.hidden ||
          element.inert ||
          element.getAttribute('aria-hidden') === 'true' ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          Number.parseFloat(style.opacity) === 0
        ) {
          return false
        }
      }
      return true
    }
  )
}
