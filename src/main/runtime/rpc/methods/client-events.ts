import {
  MobileRelayObservationSchema,
  type MobileRelayObservation
} from '../../../../shared/mobile-relay-observation'
import { getMobileConnectionManagement } from '../../../ipc/mobile-connection-management'
import { readSshPortObservationSnapshot } from '../../ssh-port-observation-snapshot'
import {
  SshCredentialObservationSchema,
  type SshCredentialObservation
} from '../../../../shared/ssh-credential-observation'
import {
  getRegisteredSshState,
  listRegisteredSshTargets,
  getSshCredentialManagement
} from '../../../ssh/ssh-target-registry'
import { getPublicSshState } from '../../public-ssh-state'
import { defineMethod, defineStreamingMethod } from '../core'
import {
  ClientEventsSubscribeParams,
  ClientEventsUnsubscribeParams
} from '../../../../shared/rpc-contract/client-events-params'

let clientEventSubscriptionSeq = 0

export const CLIENT_EVENT_METHODS = [
  defineStreamingMethod({
    name: 'runtime.clientEvents.subscribe',
    params: ClientEventsSubscribeParams,
    handler: async (
      params,
      {
        runtime,
        connectionId,
        clientKind,
        signal,
        clientId,
        pairedDeviceId,
        authenticatedCallerFingerprint
      },
      emit
    ) => {
      const local =
        Boolean(connectionId?.startsWith('local-client-events-')) &&
        !clientKind &&
        !clientId &&
        !pairedDeviceId &&
        !authenticatedCallerFingerprint
      if ((params?.connections || params?.ports || params?.relay) && !local) {
        throw new Error('local_connection_required')
      }
      const credentials = local && params?.connections === true
      const ports = local && params?.ports === true
      const relay = local && params?.relay === true
      if (signal?.aborted) {
        emit({ type: 'end' })
        return
      }
      const credentialOwner = credentials ? getSshCredentialManagement() : null
      await new Promise<void>((resolve) => {
        // Why: mobile discards terminalSideEffects; excluding it stops the
        // per-OSC batch frames from crossing the relay.
        const unsubscribe = runtime.onClientEvent(
          (event) => {
            if (event.type === 'mobileRelayChanged' && !relay) {
              return
            }
            if (event.type === 'sshPortsChanged' && !ports) {
              return
            }
            if (event.type === 'sshCredentialsChanged' && !credentials) {
              return
            }
            emit(event)
          },
          { consumesTerminalSideEffects: clientKind !== 'mobile' }
        )

        const seq = ++clientEventSubscriptionSeq
        const subscriptionId = `runtime-client-events-${connectionId ?? 'inproc'}-${seq}`
        const cancel = (): void => runtime.cleanupSubscription(subscriptionId)
        runtime.registerSubscriptionCleanup(
          subscriptionId,
          () => {
            signal?.removeEventListener('abort', cancel)
            unsubscribe()
            emit({ type: 'end' })
            resolve()
          },
          connectionId
        )

        signal?.addEventListener('abort', cancel, { once: true })
        if (signal?.aborted) {
          cancel()
          return
        }

        // Why: listener-first snapshotting closes the subscribe race while restoring state missed during disconnects.
        for (const event of runtime.getTerminalSleepClientEventSnapshot?.() ?? []) {
          emit(event)
        }
        for (const event of runtime.getNativeChatLaunchDraftResolutionClientEventSnapshot?.() ??
          []) {
          emit(event)
        }
        const sshStates = listRegisteredSshTargets().flatMap((target) => {
          const state = getPublicSshState(getRegisteredSshState(target.id) ?? null)
          return state ? [{ targetId: target.id, state }] : []
        })
        // Why: attaching the listener before snapshotting closes the reload gap without exposing HUB-private target configuration.
        let mobileRelay: MobileRelayObservation | undefined
        let sshPorts
        let sshCredentials: SshCredentialObservation | undefined
        try {
          if (relay) {
            const parsed = MobileRelayObservationSchema.safeParse(
              getMobileConnectionManagement().getRelayStatus()
            )
            if (!parsed.success) {
              cancel()
              return
            }
            mobileRelay = parsed.data
          }
          sshPorts = ports ? readSshPortObservationSnapshot() : undefined
          if (credentialOwner) {
            const parsed = SshCredentialObservationSchema.safeParse({
              requests: credentialOwner.listRequests()
            })
            if (!parsed.success) {
              cancel()
              return
            }
            sshCredentials = parsed.data
          }
        } catch {
          cancel()
          return
        }
        emit({
          type: 'ready',
          subscriptionId,
          snapshot: {
            sshStates,
            ...(mobileRelay ? { mobileRelay } : {}),
            ...(sshPorts ? { sshPorts } : {}),
            ...(sshCredentials ? { sshCredentials } : {})
          }
        })
      })
    }
  }),
  defineMethod({
    name: 'runtime.clientEvents.unsubscribe',
    params: ClientEventsUnsubscribeParams,
    handler: async (params, { runtime, connectionId }) => {
      const expectedPrefix = `runtime-client-events-${connectionId ?? 'inproc'}-`
      if (!params.subscriptionId.startsWith(expectedPrefix)) {
        return { unsubscribed: false }
      }
      runtime.cleanupSubscription(params.subscriptionId)
      return { unsubscribed: true }
    }
  })
]
