import { SettingsWarpPreviewOutput } from '../../shared/cli-settings-import-preview'
import type { GhosttyImportPreview } from '../../shared/ghostty-import-preview'
import type { WarpThemeImportPreview } from '../../shared/terminal-custom-themes'
import { callSettings } from '../settings-runtime-call'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { readSettingsJsonInput } from '../settings-json-input'
import { RuntimeClientError } from '../runtime-client'
import type { RuntimeRpcSuccess } from '../runtime-client'
import {
  CliSettingsUpdate,
  parseCliSettingsUpdate,
  projectCliSettings
} from '../../shared/cli-runtime-settings'
import type { KeybindingFileSnapshot } from '../../shared/keybindings'
import {
  SettingsWarpImportSource,
  SettingsKeybindingUpdate
} from '../../shared/rpc-contract/settings-control-params'
import { SETTINGS_DETECTION_HANDLERS } from './settings-detection'
import {
  CliDesktopSettingsUpdate,
  projectCliDesktopSettings
} from '../../shared/cli-desktop-settings'

type SettingsResult = { settings: unknown }

export const SETTINGS_HANDLERS: Record<string, CommandHandler> = {
  ...SETTINGS_DETECTION_HANDLERS,
  'settings fields': async () => {
    const result = {
      desktop: Object.keys(CliDesktopSettingsUpdate.shape).sort(),
      runtime: Object.keys(CliSettingsUpdate.shape).sort(),
      input: 'JSON file or stdin; nested values replace the named setting',
      output: 'credentials and launch commands are omitted',
      authority:
        'grants, worker-depth limits, confirmation bypasses and internal markers are excluded'
    }
    console.log(JSON.stringify(result, null, 2))
  },
  'settings import ghostty': async ({ client, json }) => {
    const response = await callSettings(() =>
      client.call<GhosttyImportPreview>('settings.control.previewGhosttyImport')
    )
    const result = {
      found: response.result.found,
      configPath: response.result.configPath,
      configPaths: response.result.configPaths,
      unsupportedKeys: response.result.unsupportedKeys,
      error: response.result.error,
      diff: projectCliDesktopSettings(response.result.diff)
    }
    printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings import warp': async ({ client, flags, cwd, json }) => {
    const file = getOptionalStringFlag(flags, 'file')
    const parsed = SettingsWarpImportSource.safeParse(
      file ? await readSettingsJsonInput(file, cwd) : undefined
    )
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid Warp theme import source.')
    }
    const response = await callSettings(() =>
      client.call<WarpThemeImportPreview>('settings.control.previewWarpThemes', parsed.data)
    )
    const result = SettingsWarpPreviewOutput.parse(response.result)
    printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings desktop get': async ({ client, json }) => {
    const response = await callSettings(() => client.call<SettingsResult>('settings.desktop.get'))
    const result = { settings: projectCliDesktopSettings(response.result.settings) }
    printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings desktop update': async ({ flags, client, cwd, json }) => {
    const input = await readSettingsJsonInput(getRequiredStringFlag(flags, 'file'), cwd)
    const parsed = CliDesktopSettingsUpdate.safeParse(input)
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid desktop settings update.')
    }
    const response = await callSettings(() =>
      client.call<{
        settings: unknown
        persisted: boolean
        rendered: boolean
      }>('settings.desktop.update', parsed.data)
    )
    const result = {
      persisted: response.result.persisted,
      rendered: response.result.rendered,
      settings: projectCliDesktopSettings(response.result.settings)
    }
    printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings fonts': async ({ client, json }) => {
    const result = await callSettings(() =>
      client.call<{ fonts: string[] }>('settings.control.listFonts')
    )
    printResult(result, json, ({ fonts }) => fonts.join('\n'))
  },
  'settings keybindings get': async ({ client, json }) => {
    const result = await callSettings(() =>
      client.call<{ keybindings: KeybindingFileSnapshot }>('keybindings.get')
    )
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings keybindings reload': async ({ client, json }) => {
    const result = await callSettings(() =>
      client.call<{ keybindings: KeybindingFileSnapshot }>('keybindings.reload')
    )
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings keybindings set': async ({ flags, client, cwd, json }) => {
    const input = await readSettingsJsonInput(getRequiredStringFlag(flags, 'file'), cwd)
    const parsed = SettingsKeybindingUpdate.safeParse(input)
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid keybinding update.')
    }
    const result = await callSettings(() =>
      client.call<{ keybindings: KeybindingFileSnapshot }>('keybindings.setAction', parsed.data)
    )
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'settings get': async ({ client, json }) => {
    const result = await callSettings(() => client.call<SettingsResult>('settings.control.get'))
    printSettings(result, json)
  },
  'settings update': async ({ flags, client, cwd, json }) => {
    const input = await readSettingsJsonInput(getRequiredStringFlag(flags, 'file'), cwd)
    let updates: ReturnType<typeof parseCliSettingsUpdate>
    try {
      updates = parseCliSettingsUpdate(input)
    } catch {
      throw new RuntimeClientError('invalid_argument', 'Invalid settings update.')
    }
    const result = await callSettings(() =>
      client.call<SettingsResult>('settings.control.update', updates)
    )
    printSettings(result, json)
  },
  'settings review-bot': async ({ flags, client, json }) => {
    const author = getRequiredStringFlag(flags, 'author')
    const value = getRequiredStringFlag(flags, 'is-bot')
    if (value !== 'true' && value !== 'false') {
      throw new RuntimeClientError('invalid_argument', '--is-bot must be true or false.')
    }
    const result = await callSettings(() =>
      client.call<SettingsResult>('settings.control.updatePRBotAuthorOverride', {
        author,
        isBot: value === 'true'
      })
    )
    printSettings(result, json)
  }
}

function printSettings(response: RuntimeRpcSuccess<SettingsResult>, json: boolean): void {
  const result = { settings: projectCliSettings(response.result.settings) }
  printResult({ ...response, result }, json, (value) => JSON.stringify(value, null, 2))
}
