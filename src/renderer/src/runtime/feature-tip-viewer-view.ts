import type { FeatureTipSnapshot } from '../../../shared/feature-tip-viewer-command'

export type FeatureTipControl = { skip: () => void }

let committed: FeatureTipSnapshot | null = null
let control: FeatureTipControl | null = null
export function publishFeatureTipView(view: FeatureTipSnapshot | null): void {
  committed = view
}
// Why: the modal's handlers close over its last render, so the CLI calls the published one.
export function publishFeatureTipControl(next: FeatureTipControl | null): void {
  control = next
}
export function readFeatureTipView(): FeatureTipSnapshot | null {
  return committed
}
export function readFeatureTipControl(): FeatureTipControl | null {
  return committed?.open ? control : null
}
