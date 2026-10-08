import { defineMethod } from '../core'
import {
  DaemonFolderAccessPlanParams,
  DaemonFolderAccessStartParams,
  DaemonFolderAccessStatusParams,
  DaemonFolderAccessCancelParams,
  DaemonFolderAccessVerifyParams
} from '../../../../shared/rpc-contract/daemon-folder-access-params'
import {
  planDaemonFolderAccess,
  startDaemonFolderAccess,
  getDaemonFolderAccessOperation,
  cancelDaemonFolderAccess,
  verifyDaemonFolderAccess
} from '../../../daemon/daemon-folder-access-workflow'

export const DAEMON_FOLDER_ACCESS_METHODS = [
  defineMethod({
    name: 'daemon.folderAccessPlan',
    params: DaemonFolderAccessPlanParams,
    handler: (_params, { runtime }) => planDaemonFolderAccess(runtime.getRuntimeId())
  }),
  defineMethod({
    name: 'daemon.folderAccessStart',
    params: DaemonFolderAccessStartParams,
    handler: (params, { runtime }) =>
      startDaemonFolderAccess(
        runtime,
        runtime.getRuntimeId(),
        DaemonFolderAccessStatusParams.strip().parse(params)
      )
  }),
  defineMethod({
    name: 'daemon.folderAccessStatus',
    params: DaemonFolderAccessStatusParams,
    handler: (params, { runtime }) =>
      getDaemonFolderAccessOperation(runtime, runtime.getRuntimeId(), params)
  }),
  defineMethod({
    name: 'daemon.folderAccessCancel',
    params: DaemonFolderAccessCancelParams,
    handler: (params, { runtime }) =>
      cancelDaemonFolderAccess(
        runtime,
        runtime.getRuntimeId(),
        DaemonFolderAccessStatusParams.strip().parse(params)
      )
  }),
  defineMethod({
    name: 'daemon.folderAccessVerify',
    params: DaemonFolderAccessVerifyParams,
    handler: (params, { runtime }) =>
      verifyDaemonFolderAccess(
        runtime,
        runtime.getRuntimeId(),
        DaemonFolderAccessStatusParams.strip().parse(params)
      )
  })
]
