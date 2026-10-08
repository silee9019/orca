import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import { tryGetProviderForPty } from '../provider/registry'
import { ptySizes } from '../delivery/visibility-state'

type ResizeRuntime = Pick<
  OrcaRuntimeService,
  | 'isResizeSuppressed'
  | 'getDriver'
  | 'isRemoteDesktopResizeDriven'
  | 'recordRemoteDesktopHostReclaimTarget'
  | 'onExternalPtyResize'
>
export function resizeHostRendererPty(
  runtime: ResizeRuntime | undefined,
  args: { id: string; cols: number; rows: number },
  assertOwner?: () => void
) {
  // Desktop fit cascades must not overwrite a layout while its resize is suppressed.
  if (runtime?.isResizeSuppressed()) {
    return 'suppressed' as const
  }
  const mobile = runtime?.getDriver(args.id).kind === 'mobile',
    remoteDesktop = runtime?.isRemoteDesktopResizeDriven?.(args.id) === true
  if (mobile || remoteDesktop) {
    if (remoteDesktop) {
      runtime?.recordRemoteDesktopHostReclaimTarget(args.id, args.cols, args.rows)
    }
    return 'remotely-driven' as const
  }
  const provider = tryGetProviderForPty(args.id)
  if (!provider) {
    return 'provider-unavailable' as const
  }
  assertOwner?.()
  try {
    provider.resize(args.id, args.cols, args.rows)
  } catch {
    return 'provider-failed' as const
  }
  assertOwner?.()
  ptySizes.set(args.id, { cols: args.cols, rows: args.rows })
  runtime?.onExternalPtyResize(args.id, args.cols, args.rows)
  return 'returned' as const
}
