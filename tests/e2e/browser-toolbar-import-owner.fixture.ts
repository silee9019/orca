import { browserImportHintCookieOwnerFixture } from './browser-import-hint-cookie-owner.fixture'
import { browserSessionRegistry } from '../../src/main/browser/browser-session-registry'
import { BrowserToolbarMenu } from '../../src/renderer/src/components/browser-pane/assemble-chrome/BrowserToolbarMenu'
import { useAppStore } from '../../src/renderer/src/store'
import { BROWSER_PROFILE_UI_COMMAND_SPECS } from '../../src/cli/specs/browser-profile-ui'
import { runBrowserProfileUi } from '../../src/cli/handlers/browser-profile-ui'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, vi } from 'vitest'

export async function browserToolbarImportOwnerFixture() {
  const { owner, file } = await browserImportHintCookieOwnerFixture()
  await owner.renderOwner(0)
  await act(async () => {
    useAppStore.setState({ browserSessionProfiles: browserSessionRegistry.listProfiles() })
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = async (copies = 1, active = true): Promise<void> => {
    await act(async () => {
      root.render(
        createElement(
          'div',
          {},
          Array.from({ length: copies }, (_, key) =>
            createElement(BrowserToolbarMenu, {
              key,
              currentProfileId: 'default',
              workspaceId: 'tab',
              browserPageId: 'page',
              viewportPresetId: null,
              onDestroyWebview: () => {},
              isActive: active,
              overflow: {
                triggerRef: { current: null },
                tools: [],
                deferUntilClose: (action: () => void) => action(),
                onMenuCloseAutoFocus: (event: Event) => event.preventDefault()
              }
            })
          )
        )
      )
    })
  }
  await render()
  const invoke = async (action: string, flags: string[] = []): Promise<void> => {
    const specs = BROWSER_PROFILE_UI_COMMAND_SPECS
    const parsed = parseArgs(
      ['browser', 'profile-ui', '--viewer', 'host', '--page', 'page', '--action', action, ...flags],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    const pending = runBrowserProfileUi({
      client: owner.client,
      flags: parsed.flags,
      cwd: owner.directory,
      json: true
    })
    let settled = false
    void pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await vi.waitFor(
      async () => {
        await act(async () => {})
        expect(settled).toBe(true)
      },
      { timeout: 4500 }
    )
    await pending
  }
  return {
    ...owner,
    file,
    render,
    invoke,
    close: async () => {
      await act(async () => root.unmount())
      container.remove()
      await owner.close()
    }
  }
}
