import { defineMethod } from '../core'
import type { PluginService } from '../../../plugins/plugin-service'
import type { PluginMarketplaceService } from '../../../plugins/plugin-marketplace-service'
import type { PluginMarketplaceInstaller } from '../../../plugins/plugin-marketplace-installer'
import { pluginMarketplaceGitSourceSchema } from '../../../../shared/plugins/plugin-marketplace'
import {
  installManagedPlugin,
  type projectPluginPreferences,
  type updateManagedPluginPreferences
} from '../../../plugins/plugin-management'
import { listPluginsForClients } from '../../../plugins/plugin-client-list'
import {
  PluginPreferencesUpdate,
  PluginInstallParams,
  PluginKeyParams,
  PluginMarketplaceSourceParams,
  PluginMarketplaceRefreshParams,
  PluginMarketplacePreviewParams,
  PluginMarketplaceInstallParams
} from '../../../../shared/rpc-contract/plugins-management-params'

type PluginManagementServices = {
  service: PluginService
  marketplace: PluginMarketplaceService
  installer: PluginMarketplaceInstaller
  remove: (pluginKey: string) => Promise<unknown>
  preferences: {
    get: () => ReturnType<typeof projectPluginPreferences>
    update: (input: unknown) => ReturnType<typeof updateManagedPluginPreferences>
  }
}
let services: PluginManagementServices | null = null
export function setPluginManagementForRpc(value: PluginManagementServices | null): void {
  services = value
}
function requireServices(): PluginManagementServices {
  if (!services) {
    throw new Error('Plugin management is not available on this runtime')
  }
  return services
}

export const PLUGIN_MANAGEMENT_METHODS = [
  defineMethod({
    name: 'plugins.getPreferences',
    params: null,
    handler: () => requireServices().preferences.get()
  }),
  defineMethod({
    name: 'plugins.updatePreferences',
    params: PluginPreferencesUpdate,
    handler: (params) => requireServices().preferences.update(params)
  }),
  defineMethod({
    name: 'plugins.install',
    params: PluginInstallParams,
    handler: (params) => installManagedPlugin(requireServices().service, params)
  }),
  defineMethod({
    name: 'plugins.remove',
    params: PluginKeyParams,
    handler: (params) => requireServices().remove(params.pluginKey)
  }),
  defineMethod({
    name: 'plugins.getLogs',
    params: PluginKeyParams,
    handler: (params) => requireServices().service.getLogs(params.pluginKey)
  }),
  defineMethod({
    name: 'plugins.refresh',
    params: null,
    handler: async () => {
      const { service } = requireServices()
      await service.refresh()
      return listPluginsForClients(service)
    }
  }),
  defineMethod({
    name: 'plugins.listLanguagePacks',
    params: null,
    handler: async () => {
      const { service } = requireServices()
      await service.whenReady()
      return service.contentPacks.languagePacks.list()
    }
  }),
  defineMethod({
    name: 'plugins.listMarketplaces',
    params: null,
    handler: () => requireServices().marketplace.listSources()
  }),
  defineMethod({
    name: 'plugins.addMarketplace',
    params: pluginMarketplaceGitSourceSchema,
    handler: (params) => requireServices().marketplace.addSource(params)
  }),
  defineMethod({
    name: 'plugins.removeMarketplace',
    params: PluginMarketplaceSourceParams,
    handler: async (params) => {
      const { marketplace } = requireServices()
      await marketplace.removeSource(params.sourceId)
      return marketplace.listSources()
    }
  }),
  defineMethod({
    name: 'plugins.refreshMarketplaces',
    params: PluginMarketplaceRefreshParams,
    handler: (params) => {
      const { marketplace } = requireServices()
      return params.sourceId
        ? marketplace.refreshSource(params.sourceId).then((source) => [source])
        : marketplace.refreshAll()
    }
  }),
  defineMethod({
    name: 'plugins.listMarketplacePlugins',
    params: null,
    handler: () => requireServices().marketplace.listPlugins()
  }),
  defineMethod({
    name: 'plugins.previewMarketplacePlugin',
    params: PluginMarketplacePreviewParams,
    handler: (params) =>
      requireServices().installer.preview(params.marketplaceSourceId, params.pluginKey)
  }),
  defineMethod({
    name: 'plugins.installMarketplacePlugin',
    params: PluginMarketplaceInstallParams,
    handler: async (params) => {
      const { service, installer } = requireServices()
      const result = await installer.install(params)
      if (result.ok) {
        await service.refresh()
      }
      return result
    }
  }),
  defineMethod({
    name: 'plugins.previewMarketplaceUpdate',
    params: PluginKeyParams,
    handler: (params) => requireServices().installer.previewInstalledUpdate(params.pluginKey)
  }),
  defineMethod({
    name: 'plugins.rollbackMarketplacePlugin',
    params: PluginKeyParams,
    handler: async (params) => {
      const { service, installer } = requireServices()
      await service.deactivatePlugin(params.pluginKey)
      const result = await installer.rollback(params.pluginKey)
      if (result.ok) {
        await service.refresh()
      }
      return result
    }
  })
]
