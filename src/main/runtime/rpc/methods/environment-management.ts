import { getRuntimeBrowserPlacementManagement } from '../../../ipc/runtime-environment-browser-placement-management'
import { defineMethod } from '../core'
import { assertLocalSshManagement } from './ssh-management'
import { getRuntimeEnvironmentManagement } from '../../../ipc/runtime-environment-management'
import {
  EnvironmentBrowserPlacement,
  EnvironmentProbe,
  EnvironmentConnect,
  EnvironmentPairing,
  EnvironmentRemove,
  EnvironmentSelector
} from '../../../../shared/rpc-contract/environment-management-params'

export const ENVIRONMENT_MANAGEMENT_METHODS = [
  defineMethod({
    name: 'environment.management.prepareBrowserPlacement',
    params: EnvironmentBrowserPlacement,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getRuntimeBrowserPlacementManagement()(args)
    }
  }),
  defineMethod({
    name: 'environment.management.probe',
    params: EnvironmentProbe,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getRuntimeEnvironmentManagement().getStatus(args)
    }
  }),
  defineMethod({
    name: 'environment.management.list',
    params: null,
    handler: (_args, ctx) => {
      assertLocalSshManagement(ctx)
      return { environments: getRuntimeEnvironmentManagement().list() }
    }
  }),
  defineMethod({
    name: 'environment.management.resolve',
    params: EnvironmentSelector,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return { environment: getRuntimeEnvironmentManagement().resolve(args) }
    }
  }),
  defineMethod({
    name: 'environment.management.verifyAndAdd',
    params: EnvironmentPairing,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getRuntimeEnvironmentManagement().verifyAndAddFromPairingCode(args)
    }
  }),
  defineMethod({
    name: 'environment.management.remove',
    params: EnvironmentRemove,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getRuntimeEnvironmentManagement().remove(args)
    }
  }),
  defineMethod({
    name: 'environment.management.connect',
    params: EnvironmentConnect,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getRuntimeEnvironmentManagement().connect(args)
    }
  }),
  defineMethod({
    name: 'environment.management.disconnect',
    params: EnvironmentSelector,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getRuntimeEnvironmentManagement().disconnect(args)
    }
  }),
  defineMethod({
    name: 'environment.management.status',
    params: null,
    handler: (_args, ctx) => {
      assertLocalSshManagement(ctx)
      return { snapshots: getRuntimeEnvironmentManagement().getStatusSnapshots() }
    }
  })
]
