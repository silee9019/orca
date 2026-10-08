import { randomUUID } from 'node:crypto'
import type { WindowsMobileFirewallStatus } from '../../shared/windows-mobile-firewall'

type MobileNetworkHumanAction = {
  id: string
  action: 'repair-firewall' | 'open-network-settings'
  address?: string
  state: 'requires-human-action' | 'cancelled' | 'verified' | 'human-confirmed'
  nextStep: string
  observation?: WindowsMobileFirewallStatus
}
// ponytail: Requests are bounded to 128 in this runtime session; persist them if restart recovery is required.
const actions = new Map<string, MobileNetworkHumanAction>()
export function createMobileNetworkHumanAction(
  args: Pick<MobileNetworkHumanAction, 'action' | 'address'>
): MobileNetworkHumanAction {
  if (actions.size >= 128) {
    for (const [id, action] of actions) {
      if (action.state !== 'requires-human-action') {
        actions.delete(id)
      }
    }
    if (actions.size >= 128) {
      throw new Error('too_many_pending_mobile_network_actions')
    }
  }
  const value: MobileNetworkHumanAction = {
    id: randomUUID(),
    ...args,
    state: 'requires-human-action',
    nextStep:
      args.action === 'repair-firewall'
        ? 'On the answering Windows host, allow Orca through Windows Firewall for the selected private network, then verify this request.'
        : 'On the answering Windows host, open Windows Network settings and review the active network. This CLI does not open or focus settings.'
  }
  actions.set(value.id, value)
  return { ...value }
}
export function readMobileNetworkHumanAction(id: string): MobileNetworkHumanAction {
  const value = actions.get(id)
  if (!value) {
    throw new Error('mobile_network_action_not_found')
  }
  return { ...value }
}
export function cancelMobileNetworkHumanAction(id: string): MobileNetworkHumanAction {
  const value = readMobileNetworkHumanAction(id)
  if (value.state === 'verified' || value.state === 'human-confirmed') {
    throw new Error('mobile_network_action_already_completed')
  }
  value.state = 'cancelled'
  value.nextStep = 'No further action is requested.'
  actions.set(id, value)
  return { ...value }
}
export async function inspectMobileNetworkHumanAction(
  id: string,
  inspect: (address?: string) => Promise<WindowsMobileFirewallStatus>
): Promise<MobileNetworkHumanAction> {
  let value = readMobileNetworkHumanAction(id)
  if (value.state !== 'requires-human-action') {
    return value
  }
  const observation = await inspect(value.address)
  value = readMobileNetworkHumanAction(id)
  if (value.state !== 'requires-human-action') {
    return value
  }
  if (
    value.action === 'repair-firewall' &&
    observation.supported &&
    observation.inspectionAvailable &&
    observation.ruleAllowed &&
    observation.blockingRuleDetected !== true
  ) {
    value.state = 'verified'
    value.nextStep = 'The answering host inspector confirmed that the firewall allows Orca.'
  }
  value.observation = observation
  actions.set(id, value)
  return { ...value }
}

export function confirmMobileNetworkHumanAction(
  id: string,
  confirmTarget: string
): MobileNetworkHumanAction {
  if (id !== confirmTarget) {
    throw new Error('confirm_target_mismatch')
  }
  const value = readMobileNetworkHumanAction(id)
  if (value.state === 'cancelled') {
    throw new Error('mobile_network_action_cancelled')
  }
  if (value.state !== 'requires-human-action') {
    return value
  }
  value.state = 'human-confirmed'
  value.nextStep =
    'The operator confirmed completion on the answering host. This is not an inspector verification.'
  actions.set(id, value)
  return { ...value }
}
