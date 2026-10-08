import { readFileSync } from 'node:fs'
import { vi } from 'vitest'
const cookieState = vi.hoisted(() => ({
  directory: '',
  ipcHandlers: new Map<string, (event: unknown, args: unknown) => unknown>(),
  ipcEvents: new Array<string>(),
  sender: {
    id: 42,
    isDestroyed: () => false,
    getType: () => 'window',
    getURL: () => 'file:///fixture/index.html'
  },
  jars: new Map<string, string>(),
  wait: Promise.resolve(),
  browsers: [
    {
      family: 'chrome',
      label: 'Fixture Chrome',
      selectedProfile: 'Default',
      profiles: [{ directory: 'Default', name: 'Fixture Profile' }]
    }
  ]
}))
function imported(partition: string, contents: string) {
  cookieState.jars.set(partition, contents)
  return {
    ok: true,
    summary: {
      totalCookies: 1,
      importedCookies: 1,
      skippedCookies: 0,
      domains: ['fixture.invalid']
    }
  }
}
vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: (channel: string) => cookieState.ipcHandlers.delete(channel),
    handle: (channel: string, handler: (event: unknown, args: unknown) => unknown) =>
      cookieState.ipcHandlers.set(channel, handler)
  },
  ipcRenderer: {
    invoke: async (channel: string, args: unknown) => {
      const handler = cookieState.ipcHandlers.get(channel)
      if (!handler) {
        throw new Error('Fixture IPC handler unavailable')
      }
      cookieState.ipcEvents.push(channel)
      return handler({ sender: cookieState.sender }, args)
    }
  },
  app: {
    isPackaged: false,
    isReady: () => true,
    getVersion: () => 'fixture',
    getPath: () => {
      if (!cookieState.directory) {
        throw new Error('Fixture profile must be configured explicitly')
      }
      return cookieState.directory
    }
  },
  session: {
    fromPartition: (partition: string) => ({
      clearStorageData: async () => {
        cookieState.jars.delete(partition)
      },
      clearCache: async () => {}
    })
  }
}))
vi.mock('../../src/main/browser/browser-cookie-import', () => ({
  detectInstalledBrowsers: () => cookieState.browsers,
  selectBrowserProfile: (_browser: unknown, profile: string) => {
    const browser = cookieState.browsers[0]
    return browser.profiles.some((entry) => entry.directory === profile)
      ? { ...browser, selectedProfile: profile }
      : null
  },
  importCookiesFromBrowser: async (_browser: unknown, partition: string) => {
    await cookieState.wait
    return imported(partition, 'private-fixture-browser-cookie')
  },
  importCookiesFromFile: async (filePath: string, partition: string) => {
    await cookieState.wait
    return imported(partition, readFileSync(filePath, 'utf8'))
  }
}))

export const cookieFixture = cookieState

vi.mock('../../src/main/telemetry/client', () => ({ track: () => {} }))
vi.mock('../../src/main/telemetry/cohort-classifier', () => ({ getCohortAtEmit: () => ({}) }))
