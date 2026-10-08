// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ArtifactPreview } from '../../src/renderer/src/components/artifacts/ArtifactPreview'
import { browserPageInteractionAndSessionsApi } from '../../src/preload/api/browser-bridge-page-interaction-and-sessions'

const transport = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('electron', () => ({ ipcRenderer: { invoke: transport.invoke } }))
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  transport.invoke.mockReset()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function installApi(): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { browser: browserPageInteractionAndSessionsApi }
  })
}

it('uses the actual preload invoke for artifact preview partition initialization and reads the resulting webview DOM', async () => {
  installApi()
  transport.invoke.mockResolvedValue('persist:fake-artifact-preview')
  const view = render(
    createElement(ArtifactPreview, { shareUrl: 'https://share.onorca.dev/a/fake' })
  )
  await act(async () => {
    await Promise.resolve()
  })
  expect(transport.invoke).toHaveBeenCalledExactlyOnceWith('browser:session:resolvePartition', {
    profileId: null
  })
  const guest = view.container.querySelector('webview')
  expect(guest?.getAttribute('partition')).toBe('persist:fake-artifact-preview')
  expect(guest?.getAttribute('src')).toBe('https://share.onorca.dev/a/fake?embed=1')
  expect(view.container.querySelector('svg')).not.toBeNull()
  act(() => {
    guest?.dispatchEvent(new Event('did-stop-loading'))
  })
  expect(view.container.querySelector('svg')).toBeNull()
  view.unmount()
  expect(guest?.isConnected).toBe(false)
})

it('does not attach a late partition response after the actual preview owner unmounts', async () => {
  installApi()
  let settle: (partition: string) => void = () => {
    throw new Error('partition request missing')
  }
  transport.invoke.mockReturnValue(
    new Promise<string>((resolve) => {
      settle = resolve
    })
  )
  const view = render(
    createElement(ArtifactPreview, { shareUrl: 'https://share.onorca.dev/a/fake' })
  )
  expect(transport.invoke).toHaveBeenCalledExactlyOnceWith('browser:session:resolvePartition', {
    profileId: null
  })
  view.unmount()
  await act(async () => {
    settle('persist:late-fake-partition')
    await Promise.resolve()
  })
  expect(document.querySelector('webview')).toBeNull()
})

it('keeps an unavailable partition response out of the guest DOM', async () => {
  installApi()
  transport.invoke.mockResolvedValue(null)
  const view = render(
    createElement(ArtifactPreview, { shareUrl: 'https://share.onorca.dev/a/fake' })
  )
  await act(async () => {
    await Promise.resolve()
  })
  expect(transport.invoke).toHaveBeenCalledExactlyOnceWith('browser:session:resolvePartition', {
    profileId: null
  })
  expect(view.container.querySelector('webview')).toBeNull()
  expect(view.container.textContent).toContain('Preview unavailable')
})
