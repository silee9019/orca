import { defineMethod } from '../core'
import {
  UsageProviderParams,
  UsageEnabledParams,
  UsageRefreshParams,
  UsageQueryParams,
  UsageSessionsParams,
  UsageBreakdownParams
} from '../../../../shared/rpc-contract/usage-params'

export const USAGE_METHODS = [
  defineMethod({
    name: 'usage.getScanState',
    params: UsageProviderParams,
    handler: ({ provider }, { runtime }) => runtime.getUsageController().getScanState(provider)
  }),
  defineMethod({
    name: 'usage.setEnabled',
    params: UsageEnabledParams,
    handler: ({ provider, enabled }, { runtime }) =>
      runtime.getUsageController().setEnabled(provider, enabled)
  }),
  defineMethod({
    name: 'usage.refresh',
    params: UsageRefreshParams,
    handler: ({ provider, force }, { runtime }) =>
      runtime.getUsageController().refresh(provider, force)
  }),
  defineMethod({
    name: 'usage.getSnapshot',
    params: UsageSessionsParams,
    handler: ({ provider, scope, range, limit }, { runtime }) =>
      runtime.getUsageController().getSnapshot(provider, scope, range, limit)
  }),
  defineMethod({
    name: 'usage.getSummary',
    params: UsageQueryParams,
    handler: ({ provider, scope, range }, { runtime }) =>
      runtime.getUsageController().getSummary(provider, scope, range)
  }),
  defineMethod({
    name: 'usage.getDaily',
    params: UsageQueryParams,
    handler: ({ provider, scope, range }, { runtime }) =>
      runtime.getUsageController().getDaily(provider, scope, range)
  }),
  defineMethod({
    name: 'usage.getBreakdown',
    params: UsageBreakdownParams,
    handler: ({ provider, scope, range, kind }, { runtime }) =>
      runtime.getUsageController().getBreakdown(provider, scope, range, kind)
  }),
  defineMethod({
    name: 'usage.getRecentSessions',
    params: UsageSessionsParams,
    handler: ({ provider, scope, range, limit }, { runtime }) =>
      runtime.getUsageController().getRecentSessions(provider, scope, range, limit)
  })
]
