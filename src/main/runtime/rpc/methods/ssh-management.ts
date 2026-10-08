import {
  removeSshTargetAfterSessionCleanup,
  terminateSshSessionsAfterReconnect
} from '../../../../shared/ssh-session-cleanup'
import { defineMethod, type RpcContext } from '../core'
import * as params from '../../../../shared/rpc-contract/ssh-management-params'
import {
  connectRegisteredSshTarget,
  listRegisteredRemovedSshTargetLabels,
  getSshTargetManagement,
  getSshConnectionManagement,
  getSshPortForwardManagement,
  getSshDirectoryManagement,
  getSshCredentialManagement
} from '../../../ssh/ssh-target-registry'

export function assertLocalSshManagement(
  ctx: Pick<
    RpcContext,
    'clientId' | 'clientKind' | 'pairedDeviceId' | 'authenticatedCallerFingerprint' | 'connectionId'
  >
): void {
  if (
    ctx.clientId ||
    ctx.clientKind ||
    ctx.pairedDeviceId ||
    ctx.authenticatedCallerFingerprint ||
    ctx.connectionId
  ) {
    throw new Error('local_connection_required')
  }
}

export const SSH_MANAGEMENT_METHODS = [
  defineMethod({
    name: 'ssh.management.browseDir',
    params: params.SshManagedBrowse,
    handler: (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getSshDirectoryManagement()(args)
    }
  }),
  defineMethod({
    name: 'ssh.management.credentialRequests',
    params: null,
    handler: (_args, ctx) => {
      assertLocalSshManagement(ctx)
      return { requests: getSshCredentialManagement().listRequests() }
    }
  }),
  defineMethod({
    name: 'ssh.management.addTarget',
    params: params.SshManagedAddTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const { addTarget: addManagedSshTarget } = getSshTargetManagement()
      const result = addManagedSshTarget(args)
      return {
        target: {
          id: result.target.id,
          label: result.target.label,
          generation: result.target.generation
        },
        repoReadoptions: result.repoReadoptions
      }
    }
  }),
  defineMethod({
    name: 'ssh.management.updateTarget',
    params: params.SshManagedUpdateTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const { updateTarget: updateManagedSshTarget } = getSshTargetManagement()
      const target = updateManagedSshTarget(args)
      if (!target) {
        throw new Error('ssh_target_not_found')
      }
      return { target: { id: target.id, label: target.label, generation: target.generation } }
    }
  }),
  defineMethod({
    name: 'ssh.management.removeTarget',
    params: params.SshManagedDestructiveTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const { removeTarget: removeManagedSshTarget } = getSshTargetManagement()
      const cleanup = await removeSshTargetAfterSessionCleanup(
        {
          terminateSessions: getSshConnectionManagement().terminateSessions,
          connect: ({ targetId }) => connectRegisteredSshTarget(targetId),
          removeTarget: removeManagedSshTarget
        },
        args.targetId
      )
      return { removed: args.targetId, cleanup }
    }
  }),
  defineMethod({
    name: 'ssh.management.importConfig',
    params: params.SshManagedImportConfig,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const { importConfig: importManagedSshConfig } = getSshTargetManagement()
      const result = importManagedSshConfig(args)
      return {
        targets: result.targets.map(({ id, label, generation }) => ({ id, label, generation })),
        repoReadoptions: result.repoReadoptions
      }
    }
  }),
  defineMethod({
    name: 'ssh.management.listConfigHosts',
    params: params.SshManagedConfigQuery,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const result = getSshTargetManagement().listConfigHosts(args)
      return {
        ...result,
        hosts: result.hosts.map((host) => ({
          alias: host.alias,
          port: host.port,
          alreadyInOrca: host.alreadyInOrca,
          previouslyRemoved: host.previouslyRemoved,
          configured: {
            hostname: Boolean(host.hostname),
            username: Boolean(host.username),
            identityFile: Boolean(host.identityFile),
            proxyCommand: Boolean(host.proxyCommand),
            jumpHost: Boolean(host.jumpHost)
          }
        }))
      }
    }
  }),
  defineMethod({
    name: 'ssh.management.resolveConfigHost',
    params: params.SshManagedConfigAlias,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const result = await getSshTargetManagement().resolveConfigHost(args)
      if (!result) {
        return null
      }
      return {
        alias: result.alias,
        port: result.port,
        configured: {
          hostname: Boolean(result.hostname),
          username: Boolean(result.username),
          identityFiles: result.identityFiles.length > 0,
          identityAgent: Boolean(result.identityAgent),
          proxyCommand: Boolean(result.proxyCommand),
          jumpHost: Boolean(result.jumpHost)
        }
      }
    }
  }),
  defineMethod({
    name: 'ssh.management.disconnect',
    params: params.SshManagedTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      await getSshConnectionManagement().disconnect(args.targetId)
      return { disconnected: args.targetId }
    }
  }),
  defineMethod({
    name: 'ssh.management.terminateSessions',
    params: params.SshManagedDestructiveTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      return terminateSshSessionsAfterReconnect(
        {
          terminateSessions: getSshConnectionManagement().terminateSessions,
          connect: ({ targetId }) => connectRegisteredSshTarget(targetId)
        },
        args.targetId
      )
    }
  }),
  defineMethod({
    name: 'ssh.management.resetRelay',
    params: params.SshManagedDestructiveTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      await getSshConnectionManagement().resetRelay(args)
      return { reset: args.targetId }
    }
  }),
  defineMethod({
    name: 'ssh.management.testConnection',
    params: params.SshManagedTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const result = await getSshConnectionManagement().testConnection(args)
      return { success: result.success }
    }
  }),
  defineMethod({
    name: 'ssh.management.needsPassphrasePrompt',
    params: params.SshManagedTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      return { required: getSshConnectionManagement().needsPassphrasePrompt(args) }
    }
  }),
  defineMethod({
    name: 'ssh.management.addPortForward',
    params: params.SshManagedAddForward,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      return getSshPortForwardManagement().addPortForward(args)
    }
  }),
  defineMethod({
    name: 'ssh.management.updatePortForward',
    params: params.SshManagedUpdateForward,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const operations = getSshPortForwardManagement()
      const existing = operations
        .listPortForwards({ targetId: args.targetId })
        .find((entry) => entry.id === args.id)
      if (!existing) {
        throw new Error('port_forward_target_mismatch')
      }
      return operations.updatePortForward(args)
    }
  }),
  defineMethod({
    name: 'ssh.management.removePortForward',
    params: params.SshManagedRemoveForward,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const operations = getSshPortForwardManagement()
      const existing = operations
        .listPortForwards({ targetId: args.targetId })
        .find((entry) => entry.id === args.id)
      if (!existing) {
        throw new Error('port_forward_target_mismatch')
      }
      return { removed: await operations.removePortForward(args) }
    }
  }),
  defineMethod({
    name: 'ssh.management.listPortForwards',
    params: params.SshManagedTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      return { forwards: getSshPortForwardManagement().listPortForwards(args) }
    }
  }),
  defineMethod({
    name: 'ssh.management.listDetectedPorts',
    params: params.SshManagedTarget,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      return { ports: getSshPortForwardManagement().listDetectedPorts(args) }
    }
  }),
  defineMethod({
    name: 'ssh.management.submitCredential',
    params: params.SshManagedCredential,
    handler: async (args, ctx) => {
      assertLocalSshManagement(ctx)
      const submitted = getSshCredentialManagement().submitCredential(args)
      if (!submitted) {
        throw new Error('ssh_credential_request_not_found')
      }
      return { submitted }
    }
  }),
  defineMethod({
    name: 'ssh.management.listRemovedTargetLabels',
    params: null,
    handler: async (_args, ctx) => {
      assertLocalSshManagement(ctx)
      return { labels: listRegisteredRemovedSshTargetLabels() }
    }
  })
]
