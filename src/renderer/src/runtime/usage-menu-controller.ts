let changeUsageMenu: ((open: boolean, retainFocus?: boolean) => Promise<{ open: boolean }>) | null =
  null

export function registerUsageMenuController(
  change: (open: boolean, retainFocus?: boolean) => Promise<{ open: boolean }>
): () => void {
  changeUsageMenu = change
  return () => {
    if (changeUsageMenu === change) {
      changeUsageMenu = null
    }
  }
}

export function setUsageMenuOpenViaViewer(
  open: boolean,
  retainFocus = false
): Promise<{ open: boolean }> {
  if (!changeUsageMenu) {
    return Promise.reject(new Error('usage_menu_unavailable'))
  }
  return changeUsageMenu(open, retainFocus)
}

export async function closeUsageMenuIfMounted(): Promise<{ mounted: boolean; open: false }> {
  if (!changeUsageMenu) {
    return { mounted: false, open: false }
  }
  const result = await changeUsageMenu(false)
  if (result.open) {
    throw new Error('usage_menu_close_not_applied')
  }
  return { mounted: true, open: false }
}
