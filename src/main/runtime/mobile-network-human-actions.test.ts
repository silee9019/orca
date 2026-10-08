import { expect, it } from 'vitest'
import {
  createMobileNetworkHumanAction,
  inspectMobileNetworkHumanAction,
  confirmMobileNetworkHumanAction,
  cancelMobileNetworkHumanAction
} from './mobile-network-human-actions'
it('keeps a firewall repair pending until the host inspector confirms allowed rules', async () => {
  const action = createMobileNetworkHumanAction({
    action: 'repair-firewall',
    address: '192.168.1.2'
  })
  expect(action.state).toBe('requires-human-action')
  const pending = await inspectMobileNetworkHumanAction(action.id, async () => ({
    supported: true,
    port: 6768,
    privateFirewallEnabled: true,
    networkCategory: 'private',
    blockingRuleDetected: false,
    inspectionAvailable: true,
    ruleAllowed: false
  }))
  expect(pending.state).toBe('requires-human-action')
  const verified = await inspectMobileNetworkHumanAction(action.id, async () => ({
    supported: true,
    port: 6768,
    privateFirewallEnabled: true,
    networkCategory: 'private',
    inspectionAvailable: true,
    ruleAllowed: true,
    blockingRuleDetected: false
  }))
  expect(verified.state).toBe('verified')
})
it('does not turn an unavailable inspection or settings-page intent into completion', async () => {
  const action = createMobileNetworkHumanAction({ action: 'open-network-settings' })
  const result = await inspectMobileNetworkHumanAction(action.id, async () => ({
    supported: true,
    port: 6768,
    privateFirewallEnabled: true,
    networkCategory: 'private',
    blockingRuleDetected: false,
    ruleAllowed: false,
    inspectionAvailable: false
  }))
  expect(result.state).toBe('requires-human-action')
  expect(cancelMobileNetworkHumanAction(action.id).state).toBe('cancelled')
  expect(
    (
      await inspectMobileNetworkHumanAction(action.id, async () => ({
        supported: true,
        port: 6768,
        privateFirewallEnabled: true,
        networkCategory: 'private',
        blockingRuleDetected: false,
        inspectionAvailable: true,
        ruleAllowed: true
      }))
    ).state
  ).toBe('cancelled')
})

it('preserves cancellation while a host inspection is in flight', async () => {
  const action = createMobileNetworkHumanAction({ action: 'repair-firewall' })
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const inspecting = inspectMobileNetworkHumanAction(action.id, async () => {
    await gate
    return {
      supported: true,
      port: 6768,
      privateFirewallEnabled: true,
      networkCategory: 'private',
      inspectionAvailable: true,
      ruleAllowed: true,
      blockingRuleDetected: false
    }
  })
  cancelMobileNetworkHumanAction(action.id)
  release?.()
  expect((await inspecting).state).toBe('cancelled')
})
it('records explicit human completion separately from inspector verification', () => {
  const action = createMobileNetworkHumanAction({ action: 'open-network-settings' })
  expect(() => confirmMobileNetworkHumanAction(action.id, 'other-request')).toThrow(
    'confirm_target_mismatch'
  )
  expect(confirmMobileNetworkHumanAction(action.id, action.id).state).toBe('human-confirmed')
  expect(() => cancelMobileNetworkHumanAction(action.id)).toThrow(
    'mobile_network_action_already_completed'
  )
  const cancelled = createMobileNetworkHumanAction({ action: 'open-network-settings' })
  cancelMobileNetworkHumanAction(cancelled.id)
  expect(() => confirmMobileNetworkHumanAction(cancelled.id, cancelled.id)).toThrow(
    'mobile_network_action_cancelled'
  )
})
