import { readMacKeyboardCommandStdout as readCommandStdout } from '../macos-keyboard-probes'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { AppIdentity } from '../../shared/app-identity'
import type { MarkdownDocument } from '../../shared/filesystem-entry-types'
import type { FloatingTerminalCwdRequest } from '../../shared/ui-chrome-types'
import type { Store } from '../persistence'
import { getDevInstanceIdentity } from '../startup/dev-instance-identity'
import { isPwshAvailableAsync } from '../pwsh'
import { isWslAvailableAsync, listWslDistrosAsync } from '../wsl'
import { isGitBashAvailable } from '../git-bash'
import { setUnreadDockBadgeCount } from '../dock/unread-badge'
import {
  ensureDefaultFloatingWorkspacePath,
  trustFloatingWorkspaceDirectory,
  resolveFloatingTerminalCwd
} from './floating-workspace-directory'
import { isMarkdownDocumentName, markdownDocumentFromFilePath } from './markdown-documents'
import { registerMacSymbolicHotkeysProbeHandler } from './macos-symbolic-hotkeys-probe'
import { registerRendererShutdownCheckpointHandler } from './renderer-shutdown-checkpoint'
import { readMacKeyboardLayoutSnapshot } from './macos-keyboard-layout-snapshot'
import { registerMacKeyboardLayoutChangeNotifications } from './macos-keyboard-layout-change-notifications'

import {
  configureDesktopAppRestart,
  requestDesktopAppRestart,
  type RegisterAppHandlersOptions
} from './app-restart'
export { requestDesktopAppRestart } from './app-restart'

const MAC_HITOOLBOX_DOMAIN = 'com.apple.HIToolbox'
// Why: defaults export reads live prefs (on-disk plist lags cfprefsd); xml1 dodges plutil's json abort on macOS 15 input-source arrays; absolute paths so a minimal PATH can't shadow the tools.
const MAC_SELECTED_INPUT_SOURCES_JSON_COMMAND = [
  `/usr/bin/defaults export ${MAC_HITOOLBOX_DOMAIN} -`,
  '/usr/bin/plutil -extract AppleSelectedInputSources xml1 -o - -',
  '/usr/bin/plutil -convert json -o - -'
].join(' | ')

async function pickFloatingMarkdownDocument(
  event: IpcMainInvokeEvent
): Promise<MarkdownDocument | null> {
  const cwd = await ensureDefaultFloatingWorkspacePath()
  const options = {
    defaultPath: cwd,
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'mdx', 'markdown'] }]
  } satisfies Electron.OpenDialogOptions
  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  const filePath = result.filePaths[0]
  if (!isMarkdownDocumentName(filePath)) {
    throw new Error('Selected file is not a markdown document.')
  }
  return markdownDocumentFromFilePath(cwd, filePath, { outsideRootRelativePath: 'basename' })
}

async function pickFloatingWorkspaceDirectory(
  event: IpcMainInvokeEvent,
  store: Store
): Promise<string | null> {
  const parentWindow = BrowserWindow.fromWebContents(event.sender)
  const options = {
    // Why: this picker only chooses an existing directory; creation belongs to explicit file actions.
    properties: ['openDirectory']
  } satisfies Electron.OpenDialogOptions
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  const selectedDir = result.filePaths[0]
  // Why: only a user-approved picker selection may become the floating terminal's cwd, unlike typed settings text.
  await trustFloatingWorkspaceDirectory(store, selectedDir)
  return selectedDir
}

export function getFeatureWallAssetBaseUrl(): string {
  const assetDir = app.isPackaged
    ? path.join(process.resourcesPath, 'onboarding', 'feature-wall')
    : resolveDevFeatureWallAssetDir()

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    const vitePath = assetDir.split(path.sep).join('/')
    const absoluteVitePath = vitePath.startsWith('/') ? vitePath : `/${vitePath}`
    // Why: Chromium blocks file:// image loads from the http dev origin; Vite's /@fs route serves the same local media.
    return new URL(`/@fs${absoluteVitePath}/`, process.env.ELECTRON_RENDERER_URL).toString()
  }

  return `${pathToFileURL(assetDir).toString()}/`
}

function resolveDevFeatureWallAssetDir(): string {
  const relativeDir = path.join('resources', 'onboarding', 'feature-wall')
  const candidates = [
    path.join(app.getAppPath(), relativeDir),
    path.resolve(app.getAppPath(), '..', '..', relativeDir),
    path.join(process.cwd(), relativeDir)
  ]

  // Why: E2E launches out/main, so app.getAppPath() can point there while dev resources live at the repo root.
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

type SelectedKeyboardInputSource = { kind: 'inputSource'; id: string } | { kind: 'keyboardLayout' }

function readSelectedInputSourceFromJson(stdout: string): SelectedKeyboardInputSource | null {
  let records: unknown
  try {
    records = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(records)) {
    return null
  }

  let hasSelectedKeyboardLayout = false
  for (const record of records.slice().toReversed()) {
    if (!record || typeof record !== 'object') {
      continue
    }
    const kind =
      'InputSourceKind' in record && typeof record.InputSourceKind === 'string'
        ? record.InputSourceKind.trim().toLowerCase()
        : ''
    if (kind === 'keyboard layout') {
      hasSelectedKeyboardLayout = true
      continue
    }
    if (kind.includes('non keyboard')) {
      continue
    }
    if (kind !== 'input mode' && kind !== 'keyboard input method') {
      return null
    }
    const inputMode = 'Input Mode' in record ? record['Input Mode'] : undefined
    const bundleId = 'Bundle ID' in record ? record['Bundle ID'] : undefined
    const id = typeof inputMode === 'string' && inputMode.trim() ? inputMode : bundleId
    if (typeof id === 'string' && id.trim()) {
      return { kind: 'inputSource', id: id.trim() }
    }
    return null
  }
  return hasSelectedKeyboardLayout ? { kind: 'keyboardLayout' } : null
}

async function readSelectedKeyboardInputSource(): Promise<SelectedKeyboardInputSource | null> {
  try {
    const stdout = await readCommandStdout(
      '/bin/sh',
      ['-c', MAC_SELECTED_INPUT_SOURCES_JSON_COMMAND],
      'Selected keyboard input source probe timed out'
    )
    return readSelectedInputSourceFromJson(stdout)
  } catch {
    return null
  }
}

async function readKeyboardInputSourceId(): Promise<string | null> {
  const selectedInputSource = await readSelectedKeyboardInputSource()
  if (selectedInputSource?.kind === 'inputSource') {
    return selectedInputSource.id
  }
  // An IME can use ABC underneath; the backing layout alone cannot identify the selected source.
  return selectedInputSource?.kind === 'keyboardLayout'
    ? readCommandStdout(
        '/usr/bin/defaults',
        ['read', MAC_HITOOLBOX_DOMAIN, 'AppleCurrentKeyboardLayoutInputSourceID'],
        'Keyboard layout input source probe timed out'
      )
    : null
}

export function registerAppHandlers(store: Store, options: RegisterAppHandlersOptions = {}): void {
  configureDesktopAppRestart(options)
  registerRendererShutdownCheckpointHandler(store)
  registerMacKeyboardLayoutChangeNotifications()

  ipcMain.handle('app:getFeatureWallAssetBaseUrl', (): string => getFeatureWallAssetBaseUrl())

  ipcMain.handle('app:getIdentity', (): AppIdentity => {
    const identity = getDevInstanceIdentity(is.dev)
    return {
      name: identity.name,
      isDev: identity.isDev,
      devLabel: identity.devLabel,
      devBranch: identity.devBranch,
      devWorktreeName: identity.devWorktreeName,
      devRepoRoot: identity.devRepoRoot,
      dockBadgeLabel: identity.dockBadgeLabel
    }
  })

  // Why: these probes spawn wsl.exe/pwsh.exe; the sync variants would block the main event
  // loop — every PTY message, window IPC and watchdog beat — for up to 5s per renderer read.
  ipcMain.handle('wsl:isAvailable', (): Promise<boolean> => isWslAvailableAsync())
  ipcMain.handle('wsl:listDistros', (): Promise<string[]> => listWslDistrosAsync())
  ipcMain.handle('pwsh:isAvailable', (): Promise<boolean> => isPwshAvailableAsync())
  ipcMain.handle('gitBash:isAvailable', (): boolean => isGitBashAvailable())

  // The selected IME identity must win over its US-shaped backing keyboard layout.
  ipcMain.handle('app:getKeyboardInputSourceId', getKeyboardInputSourceId)

  ipcMain.handle('app:getKeyboardLayoutSnapshot', () => readMacKeyboardLayoutSnapshot())

  ipcMain.handle('app:relaunch', () => requestDesktopAppRestart('relaunch'))
  ipcMain.handle('app:restart', () => requestDesktopAppRestart('restart'))

  registerMacSymbolicHotkeysProbeHandler(readCommandStdout)

  ipcMain.handle('app:setUnreadDockBadgeCount', (_event, count: number) => {
    setUnreadDockBadgeCount(Number.isFinite(count) ? count : 0)
  })

  ipcMain.handle('app:getFloatingTerminalCwd', (_event, args?: FloatingTerminalCwdRequest) =>
    resolveFloatingTerminalCwd(store, args)
  )

  ipcMain.handle('app:getFloatingMarkdownDirectory', () => ensureDefaultFloatingWorkspacePath())

  ipcMain.handle('app:pickFloatingMarkdownDocument', (event) => pickFloatingMarkdownDocument(event))

  ipcMain.handle('app:pickFloatingWorkspaceDirectory', (event) =>
    pickFloatingWorkspaceDirectory(event, store)
  )
}

export async function getKeyboardInputSourceId(): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return null
  }
  try {
    // Why: async so the focus-in probe (see option-as-alt-probe.ts) never blocks the main event loop.
    const stdout = await readKeyboardInputSourceId()
    const trimmed = stdout?.trim() ?? ''
    return trimmed.length > 0 ? trimmed : null
  } catch {
    // A failed probe must not promote an IME's backing layout into an Alt default.
    return null
  }
}
