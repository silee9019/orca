import { defineMethod } from '../core'
import {
  DaemonRestartParams,
  DaemonRestartPlanParams
} from '../../../../shared/rpc-contract/daemon-restart-params'
import { getDaemonRestartPlan, restartPinnedDaemon } from '../../../daemon/daemon-restart-control'

export const DAEMON_RESTART_METHODS = [
  defineMethod({
    name: 'daemon.restartPlan',
    params: DaemonRestartPlanParams,
    handler: (_params, { runtime }) => getDaemonRestartPlan(runtime.getRuntimeId())
  }),
  defineMethod({
    name: 'daemon.restartPinned',
    params: DaemonRestartParams,
    handler: (params, { runtime }) => restartPinnedDaemon(runtime.getRuntimeId(), params)
  })
]
