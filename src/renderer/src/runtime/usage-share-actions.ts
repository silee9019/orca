type UsageShareActions = {
  open: () => void
  copy: () => Promise<void>
  shareToX: () => Promise<void>
}
let claudeActions: UsageShareActions | null = null
let codexActions: UsageShareActions | null = null

export function registerUsageShareActions(
  provider: 'claude' | 'codex',
  actions: UsageShareActions
): () => void {
  if (provider === 'claude') {
    claudeActions = actions
  } else {
    codexActions = actions
  }
  return () => {
    if (provider === 'claude' && claudeActions === actions) {
      claudeActions = null
    }
    if (provider === 'codex' && codexActions === actions) {
      codexActions = null
    }
  }
}

export async function applyUsageShareAction(
  provider: 'claude' | 'codex',
  action: 'open' | 'copy' | 'x'
) {
  const actions = provider === 'claude' ? claudeActions : codexActions
  if (!actions) {
    throw new Error('usage_share_unavailable: open the provider analytics panel first')
  }
  switch (action) {
    case 'open':
      actions.open()
      break
    case 'copy':
      await actions.copy()
      break
    case 'x':
      await actions.shareToX()
      break
  }
  return { provider, shared: action }
}
