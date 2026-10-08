type LoginLinkControls = { copy: () => Promise<boolean>; open: () => Promise<void> }

const mounted = new Set<LoginLinkControls>()

export function registerAccountLoginLinkControls(controls: LoginLinkControls): () => void {
  mounted.add(controls)
  return () => {
    mounted.delete(controls)
  }
}

export async function applyAccountLoginLinkAction(operation: 'copy' | 'open'): Promise<unknown> {
  const controls = [...mounted]
  if (controls.length !== 1) {
    throw new Error('Exactly one pending Codex login link must be mounted')
  }
  try {
    if (operation === 'copy') {
      return { copied: await controls[0].copy() }
    }
    await controls[0].open()
    return { opened: true }
  } catch {
    throw new Error('The pending Codex login link action failed')
  }
}
