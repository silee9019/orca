import { z } from 'zod'
const sshViewer = {
  viewerId: z.number().int().positive(),
  surface: z.enum(['settings', 'add-host']).optional()
}
export type SshViewerSurface = 'settings' | 'add-host'
export const SshViewerDraftUpdates = z
  .object({
    label: z.string().max(65536).optional(),
    configHost: z.string().max(65536).optional(),
    host: z.string().max(65536).optional(),
    port: z.string().max(16).optional(),
    username: z.string().max(65536).optional(),
    identityFile: z.string().max(65536).optional(),
    gssapiAuthentication: z.boolean().optional(),
    proxyCommand: z.string().max(65536).optional(),
    jumpHost: z.string().max(65536).optional(),
    systemSshConnectionReuse: z.boolean().optional(),
    relayGracePeriodSeconds: z.string().max(16).optional(),
    relayKeepAliveUntilReset: z.boolean().optional(),
    remoteRuntime: z.enum(['auto', 'legacy', 'pinned-node']).optional()
  })
  .strict()
export type SshViewerDraft = z.infer<typeof SshViewerDraftUpdates>
export const SshConnectionsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...sshViewer,
      operation: z.enum([
        'ssh.get',
        'ssh.form-open',
        'ssh.form-cancel',
        'ssh.form-save',
        'ssh.form-normalize'
      ])
    })
    .strict(),
  z
    .object({ ...sshViewer, operation: z.literal('ssh.form-edit'), targetId: z.string().min(1) })
    .strict(),
  z
    .object({
      ...sshViewer,
      operation: z.enum(['ssh.connect', 'ssh.test']),
      targetId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...sshViewer,
      operation: z.literal('ssh.disconnect'),
      targetId: z.string().min(1),
      confirmTarget: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...sshViewer,
      operation: z.literal('ssh.import'),
      confirmTarget: z.literal('ssh-config-all-hosts')
    })
    .strict(),
  z
    .object({
      ...sshViewer,
      operation: z.literal('ssh.form-draft'),
      updates: SshViewerDraftUpdates
    })
    .strict(),
  z.object({ ...sshViewer, operation: z.literal('ssh.advanced'), open: z.boolean() }).strict(),
  z.object({ ...sshViewer, operation: z.literal('ssh.config-open') }).strict(),
  z
    .object({
      ...sshViewer,
      operation: z.literal('ssh.config-search'),
      query: z.string().max(65536),
      refresh: z.boolean().optional()
    })
    .strict(),
  z
    .object({
      ...sshViewer,
      operation: z.literal('ssh.config-select'),
      alias: z.string().min(1).max(65536)
    })
    .strict(),
  z
    .object({
      ...sshViewer,
      operation: z.literal('ssh.config-import-new'),
      confirmTarget: z.literal('ssh-config-new-hosts')
    })
    .strict()
])
