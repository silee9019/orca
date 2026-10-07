import type { ProviderRateLimits } from '../../../shared/rate-limit-types'
type Provider = ProviderRateLimits['provider']
type Callbacks = {
  canSignIn: (provider: Provider) => boolean
  onSignIn: (provider: Provider) => void
  providers: () => Provider[]
}
const roster = new Set<Callbacks>()
export function registerUsageRosterSignIn(callbacks: Callbacks) {
  roster.add(callbacks)
  return () => {
    roster.delete(callbacks)
  }
}
export function applyUsageRosterSignIn(provider: Provider) {
  if (roster.size > 1) {
    throw new Error('usage_roster_ambiguous')
  }
  const callbacks = [...roster][0]
  if (!callbacks || !callbacks.providers().includes(provider) || !callbacks.canSignIn(provider)) {
    throw new Error('usage_roster_signin_unavailable')
  }
  callbacks.onSignIn(provider)
  return { provider, navigationRequested: true }
}
