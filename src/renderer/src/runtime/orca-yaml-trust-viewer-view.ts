import type { OrcaYamlTrustSnapshot } from '../../../shared/orca-yaml-trust-viewer-command'

// Why: token is the caller's settle function, unique per prompt, so a follow-up prompt for the same script is not mistaken for the one declined.
export type OrcaYamlTrustControl = { skip: () => void; token: unknown }

let committed: OrcaYamlTrustSnapshot | null = null
let control: OrcaYamlTrustControl | null = null
export function publishOrcaYamlTrustView(view: OrcaYamlTrustSnapshot | null): void {
  committed = view
}
// Why: the dialog's handlers close over its last render, so the CLI calls the published one.
export function publishOrcaYamlTrustControl(next: OrcaYamlTrustControl | null): void {
  control = next
}
export function readOrcaYamlTrustView(): OrcaYamlTrustSnapshot | null {
  return committed
}
export function readOrcaYamlTrustControl(): OrcaYamlTrustControl | null {
  return committed?.open ? control : null
}
