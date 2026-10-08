import { defineMethod } from '../core'
import {
  DesktopOnboardingUpdateParams,
  DesktopTelemetryEventParams,
  DesktopTelemetryOptInParams
} from '../../../../shared/rpc-contract/app-lifecycle-params'
import { assertDesktopAppContext } from './desktop-app-target'

export const DESKTOP_SUPPORT_METHODS = [
  defineMethod({
    name: 'desktopOnboarding.get',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/onboarding')).getOnboardingOperations().get()
    }
  }),
  defineMethod({
    name: 'desktopOnboarding.update',
    params: DesktopOnboardingUpdateParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/onboarding')).getOnboardingOperations().update(params)
    }
  }),
  defineMethod({
    name: 'desktopTelemetry.getConsentState',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/telemetry')).getTelemetryOperations().getConsentState()
    }
  }),
  defineMethod({
    name: 'desktopTelemetry.setOptIn',
    params: DesktopTelemetryOptInParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      const operations = (await import('../../../ipc/telemetry')).getTelemetryOperations()
      await operations.setOptIn(params.optedIn)
      return operations.getConsentState()
    }
  }),
  defineMethod({
    name: 'desktopTelemetry.acknowledgeBanner',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      const operations = (await import('../../../ipc/telemetry')).getTelemetryOperations()
      await operations.acknowledgeBanner()
      return operations.getConsentState()
    }
  }),
  defineMethod({
    name: 'desktopTelemetry.track',
    params: DesktopTelemetryEventParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      const operations = (await import('../../../ipc/telemetry')).getTelemetryOperations()
      operations.track(params.name, params.props)
      return { state: 'submitted' as const, consent: operations.getConsentState() }
    }
  })
]
