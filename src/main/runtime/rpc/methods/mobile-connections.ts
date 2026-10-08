import { resolveAdvertisedPairingHostname } from '../../pairing-endpoint'
import { classifyRemotePairingHostname } from '../../../../shared/remote-pairing-address'
import { defineMethod } from '../core'
import { assertLocalSshManagement } from './ssh-management'
import { getMobileConnectionManagement } from '../../../ipc/mobile-connection-management'
import {
  MobileAddressParams,
  MobilePairingParams,
  MobileRevokeParams,
  RuntimePairingParams
} from '../../../../shared/rpc-contract/mobile-connection-params'
import { canMintMobilePairingOffer } from '../../../../shared/mobile-pairing-connection-mode'

export const MOBILE_CONNECTION_METHODS = [
  defineMethod({
    name: 'mobile.connection.networkInterfaces',
    params: null,
    handler: (_args, ctx) => {
      assertLocalSshManagement(ctx)
      return getMobileConnectionManagement().listNetworkInterfaces()
    }
  }),
  defineMethod({
    name: 'mobile.connection.pairing',
    params: MobilePairingParams,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      const operations = getMobileConnectionManagement()
      if (
        !canMintMobilePairingOffer({
          connectionMode: args.connectionMode,
          signedIn: args.connectionMode === 'local-only' || operations.isSignedIn()
        })
      ) {
        throw new Error('sign_in_required_for_relay_pairing')
      }
      return operations.getPairingQR(args)
    }
  }),
  defineMethod({
    name: 'mobile.connection.runtimePairing',
    params: RuntimePairingParams,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      const address = args.reach === 'this-computer' ? (args.address ?? '127.0.0.1') : args.address
      if (args.reach === 'this-computer') {
        const hostname = resolveAdvertisedPairingHostname(address)
        if (!hostname || classifyRemotePairingHostname(hostname) !== 'loopback') {
          throw new Error('loopback_address_required')
        }
      }
      return getMobileConnectionManagement().getRuntimePairingUrl({ ...args, address })
    }
  }),
  defineMethod({
    name: 'mobile.connection.devices',
    params: null,
    handler: (_args, ctx) => {
      assertLocalSshManagement(ctx)
      return getMobileConnectionManagement().listDevices()
    }
  }),
  defineMethod({
    name: 'mobile.connection.grants',
    params: null,
    handler: (_args, ctx) => {
      assertLocalSshManagement(ctx)
      return getMobileConnectionManagement().listRuntimeAccessGrants()
    }
  }),
  defineMethod({
    name: 'mobile.connection.revokeDevice',
    params: MobileRevokeParams,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getMobileConnectionManagement().revokeDevice(args)
    }
  }),
  defineMethod({
    name: 'mobile.connection.revokeGrant',
    params: MobileRevokeParams,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getMobileConnectionManagement().revokeRuntimeAccess(args)
    }
  }),
  defineMethod({
    name: 'mobile.connection.status',
    params: null,
    handler: (_args, ctx) => {
      assertLocalSshManagement(ctx)
      return getMobileConnectionManagement().isWebSocketReady()
    }
  }),
  defineMethod({
    name: 'mobile.connection.relay',
    params: null,
    handler: (_args, ctx) => {
      assertLocalSshManagement(ctx)
      return getMobileConnectionManagement().getRelayStatus()
    }
  }),
  defineMethod({
    name: 'mobile.connection.firewall',
    params: MobileAddressParams,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getMobileConnectionManagement().getWindowsFirewallStatus(args)
    }
  })
]
