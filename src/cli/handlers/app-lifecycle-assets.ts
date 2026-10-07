import { DesktopFeedbackSubmitParams } from '../../shared/rpc-contract/app-feedback-params'
import type { CommandHandler } from '../dispatch'
import {
  DesktopPetPreferencesParams,
  DesktopDockBadgeParams,
  DesktopPetDeleteParams,
  DesktopPetFileParams,
  DesktopPetImportParams,
  DesktopSelectPathParams,
  DesktopShellUrlParams,
  DesktopStarPromptParams
} from '../../shared/rpc-contract/app-lifecycle-params'
import { AppVaultFirstPromptParams } from '../../shared/rpc-contract/app-vault-params'
import {
  savePrivateAppResult,
  confirmTarget,
  printCall,
  readAppInput,
  requiredFlag,
  stringFlag
} from './app-lifecycle-command'

export const APP_ASSET_HANDLERS: Record<string, CommandHandler> = {
  'app feedback submit': async (context) => {
    const input = DesktopFeedbackSubmitParams.omit({ confirmTarget: true }).parse(
      await readAppInput(context)
    )
    await printCall(context, 'desktopFeedback.submit', {
      ...input,
      confirmTarget: confirmTarget(context.flags)
    })
  },
  'app pet preferences': (context) => printCall(context, 'desktopPet.preferences'),
  'app pet set': async (context) =>
    printCall(
      context,
      'desktopPet.setPreferences',
      DesktopPetPreferencesParams.parse(await readAppInput(context))
    ),
  'app pet remove': (context) =>
    printCall(context, 'desktopPet.remove', {
      id: requiredFlag(context.flags, 'id'),
      confirmId: requiredFlag(context.flags, 'confirm-id')
    }),
  'app feature-assets': (context) => printCall(context, 'app.featureWallAssets'),
  'app markdown-directory': (context) => printCall(context, 'app.floatingMarkdownDirectory'),
  'app keyboard-source': (context) => printCall(context, 'app.keyboardInputSource'),
  'app keyboard-layout': (context) => printCall(context, 'app.keyboardLayout'),
  'app dock-badge': (context) =>
    printCall(
      context,
      'app.setDockBadge',
      DesktopDockBadgeParams.parse({ count: Number(requiredFlag(context.flags, 'count')) })
    ),
  'app pet import': (context) =>
    printCall(
      context,
      'desktopPet.import',
      DesktopPetImportParams.parse({
        path: requiredFlag(context.flags, 'path'),
        kind: requiredFlag(context.flags, 'kind')
      })
    ),
  'app pet read': (context) =>
    printCall(
      context,
      'desktopPet.read',
      DesktopPetFileParams.parse({
        id: requiredFlag(context.flags, 'id'),
        fileName: requiredFlag(context.flags, 'file-name'),
        kind: stringFlag(context.flags, 'kind')
      })
    ),
  'app pet delete': (context) =>
    printCall(
      context,
      'desktopPet.delete',
      DesktopPetDeleteParams.parse({
        id: requiredFlag(context.flags, 'id'),
        fileName: requiredFlag(context.flags, 'file-name'),
        kind: stringFlag(context.flags, 'kind'),
        confirmId: requiredFlag(context.flags, 'confirm-id')
      })
    ),
  'app shell open-url': async (context) =>
    printCall(
      context,
      'desktopShell.openUrl',
      DesktopShellUrlParams.parse(await readAppInput(context))
    ),
  'app shell open-path': (context) =>
    printCall(context, 'desktopShell.openPath', { path: requiredFlag(context.flags, 'path') }),
  'app shell exists': (context) =>
    printCall(context, 'desktopShell.pathExists', { path: requiredFlag(context.flags, 'path') }),
  'app shell select': (context) =>
    printCall(
      context,
      'desktopShell.selectPath',
      DesktopSelectPathParams.parse({
        path: requiredFlag(context.flags, 'path'),
        kind: requiredFlag(context.flags, 'kind')
      })
    ),
  'app star-prompt': (context) =>
    printCall(
      context,
      'desktopStarPrompt.control',
      DesktopStarPromptParams.parse({
        action: requiredFlag(context.flags, 'action'),
        viewer: context.flags.has('viewer')
          ? Number(requiredFlag(context.flags, 'viewer'))
          : undefined,
        confirmTarget: stringFlag(context.flags, 'confirm-target')
      })
    ),
  'app vault status': (context) => printCall(context, 'aiVault.searchStatus', {}),
  'app vault first-prompt': async (context) =>
    savePrivateAppResult(
      context,
      'appVault.firstUserPrompt',
      AppVaultFirstPromptParams.parse(await readAppInput(context))
    ),
  'app vault clear-index': (context) =>
    printCall(context, 'appVault.clearSearchIndex', { confirmTarget: confirmTarget(context.flags) })
}
