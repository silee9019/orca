import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import type { PtyRendererDelivery } from '../session'

type Binding = {
  runtime?: OrcaRuntimeService
  mainWindow?: PtyRendererDelivery
  generation: number
  changed: () => void
}
let active: Binding | undefined
const tails = new Map<string, Promise<boolean>>()
export function bindHostViewportClaimOwner(deps: {
  runtime?: OrcaRuntimeService
  mainWindow?: PtyRendererDelivery
}): void {
  if (active?.mainWindow) {
    active.mainWindow.webContents.removeListener('did-start-navigation', active.changed)
    active.mainWindow.webContents.removeListener('render-process-gone', active.changed)
  }
  const binding: Binding = {
    ...deps,
    generation: 0,
    changed: () => {
      binding.generation++
    }
  }
  active = binding
  tails.clear()
  binding.mainWindow?.webContents.on('did-start-navigation', binding.changed)
  binding.mainWindow?.webContents.on('render-process-gone', binding.changed)
}
export function writeAfterHostViewportClaim(
  id: string,
  write: () => boolean | Promise<boolean>
): boolean | Promise<boolean> {
  const tail = tails.get(id)
  return tail ? tail.then((claimed) => (claimed ? write() : false)) : write()
}
export function claimHostViewport(
  runtime: OrcaRuntimeService,
  rendererId: number,
  args: { id: string; cols: number; rows: number },
  ownerMatches?: () => boolean,
  onFailure?: (error: unknown) => void
): Promise<boolean> {
  const binding = active,
    generation = binding?.generation,
    matches = () => {
      try {
        const window = binding?.mainWindow
        return (
          !!window &&
          active === binding &&
          binding.runtime === runtime &&
          binding.generation === generation &&
          !window.isDestroyed() &&
          !window.webContents.isDestroyed() &&
          window.webContents.id === rendererId &&
          (ownerMatches?.() ?? true)
        )
      } catch {
        return false
      }
    }
  if (!matches()) {
    return Promise.resolve(false)
  }
  const run = async () => {
      if (!matches()) {
        return false
      }
      const claimed = await runtime.claimRemoteDesktopHost(args.id, args.cols, args.rows, matches)
      return matches() && claimed
    },
    prior = tails.get(args.id),
    claim = (prior ? prior.then(run, run) : run()).catch((error) => {
      onFailure?.(error)
      return false
    })
  tails.set(args.id, claim)
  void claim.then(() => {
    if (tails.get(args.id) === claim) {
      tails.delete(args.id)
    }
  })
  return claim
}
