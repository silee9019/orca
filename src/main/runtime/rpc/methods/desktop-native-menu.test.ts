import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { buildRegistry } from '../core'
import { desktopAppTarget } from './desktop-app-target'
import { DESKTOP_NATIVE_MENU_METHODS } from './desktop-native-menu'
const fixture = vi.hoisted(() => ({
  hidden: false,
  hide: vi.fn(),
  about: vi.fn(),
  native: vi.fn()
}))
vi.mock('electron', () => ({
  app: {
    isHidden: () => fixture.hidden,
    hide: () => {
      fixture.hidden = true
      fixture.hide()
    },
    showAboutPanel: fixture.about
  },
  Menu: {
    sendActionToFirstResponder: (selector: string) => {
      fixture.native(selector)
      if (selector === 'unhideAllApplications:') {
        fixture.hidden = false
      }
    }
  }
}))
vi.mock('../../orca-runtime', () => ({
  OrcaRuntimeService: class {
    getRuntimeId() {
      return 'native-fixture'
    }
    getStatus() {
      return { desktopWindowStatus: 'available' }
    }
  }
}))
const context = { runtime: OrcaRuntimeService.prototype }
const method = buildRegistry(DESKTOP_NATIVE_MENU_METHODS).get('app.nativeMenu')
async function invoke(action: string, confirmTarget = desktopAppTarget(context)): Promise<unknown> {
  if (!method || 'stream' in method) {
    throw new Error('Missing method')
  }
  return method.handler(method.params?.parse({ action, confirmTarget }), context)
}
beforeEach(() =>
  Object.defineProperty(process.versions, 'electron', { configurable: true, value: 'fixture' })
)
afterEach(() => {
  Reflect.deleteProperty(process.versions, 'electron')
  vi.clearAllMocks()
})
describe('native app menu controls', () => {
  it('requires the exact app before native calls and distinguishes request from completion', async () => {
    await expect(invoke('about', 'wrong')).rejects.toThrow('target changed')
    expect(fixture.about).not.toHaveBeenCalled()
    await expect(invoke('about')).resolves.toMatchObject({ state: 'requested', completed: false })
    expect(fixture.about).toHaveBeenCalledOnce()
  })
  it.skipIf(process.platform !== 'darwin')(
    'uses macOS roles and leaves Services to the native human selection',
    async () => {
      await invoke('hide')
      await expect(invoke('status')).resolves.toMatchObject({ hidden: true })
      await invoke('unhide')
      await expect(invoke('status')).resolves.toMatchObject({ hidden: false })
      await invoke('hide-others')
      expect(fixture.native).toHaveBeenLastCalledWith('hideOtherApplications:')
      const before = fixture.native.mock.calls.length
      await expect(invoke('services')).resolves.toMatchObject({ state: 'human-required' })
      expect(fixture.native).toHaveBeenCalledTimes(before)
    }
  )
})
