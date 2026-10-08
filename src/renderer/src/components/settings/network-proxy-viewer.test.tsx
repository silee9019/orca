// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import { AdvancedNetworkSettingsSection } from './AdvancedNetworkSettingsSection'
import { applyNetworkProxyViewerRequest } from '@/runtime/network-proxy-viewer'
const write = vi.fn()
function Surface() {
  const settings = useAppStore((state) => state.settings)
  return settings ? (
    <AdvancedNetworkSettingsSection settings={settings} updateSettings={write} />
  ) : null
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applyNetworkProxyViewerRequest> | undefined
  await act(async () => {
    pending = applyNetworkProxyViewerRequest({ id: 'proxy', expiresAt: Date.now() + 300, command })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
beforeEach(() => {
  vi.clearAllMocks()
  write.mockReset()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ settings: getDefaultSettings('/fixture') })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { settings: { get: vi.fn(async () => useAppStore.getState().settings) } }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('pairs native disclosure and private URL/bypass input with exact typed drafts without saving', async () => {
  render(<Surface />)
  fireEvent.click(screen.getByRole('button', { name: 'Configure proxy' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'HTTP Proxy' }), {
    target: { value: 'http://native:private@proxy.example:8080' }
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Proxy Bypass Rules' }), {
    target: { value: 'native.example' }
  })
  await expect(invoke({ viewerId: 7, operation: 'network-proxy.get' })).resolves.toMatchObject({
    applied: true,
    persisted: null,
    state: { open: true, urlDraftSet: true, bypassDraftSet: true }
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'network-proxy.url-draft',
    value: 'http://typed:private-credential-canary@proxy.example:8080'
  })
  expect(result).toMatchObject({ applied: true, persisted: null })
  expect(screen.getByRole('textbox', { name: 'HTTP Proxy' })).toHaveValue(
    'http://typed:private-credential-canary@proxy.example:8080'
  )
  expect(JSON.stringify(result)).not.toContain('private-credential-canary')
  await expect(
    invoke({
      viewerId: 7,
      operation: 'network-proxy.bypass-draft',
      value: 'typed.example\n*.internal'
    })
  ).resolves.toMatchObject({ applied: true, persisted: null })
  expect(screen.getByRole('textbox', { name: 'Proxy Bypass Rules' })).toHaveValue(
    'typed.example\n*.internal'
  )
  expect(write).not.toHaveBeenCalled()
  await expect(
    invoke({ viewerId: 7, operation: 'network-proxy.disclosure', open: false })
  ).resolves.toMatchObject({ applied: true, state: { open: false } })
  await expect(
    invoke({ viewerId: 7, operation: 'network-proxy.url-draft', value: 'hidden-canary' })
  ).rejects.toThrow('connections_surface_unavailable')
})
it('preserves search/configuration forced disclosure and reconciles canonical external settings into drafts', async () => {
  useAppStore.setState({ settingsSearchQuery: 'proxy' })
  render(<Surface />)
  await expect(
    invoke({ viewerId: 7, operation: 'network-proxy.disclosure', open: false })
  ).resolves.toMatchObject({ applied: false, state: { open: true, forcedOpen: true } })
  await invoke({ viewerId: 7, operation: 'network-proxy.url-draft', value: 'draft-canary' })
  await act(async () => {
    const settings = useAppStore.getState().settings
    if (settings) {
      useAppStore.setState({
        settings: { ...settings, httpProxyUrl: 'http://canonical.example:8080' }
      })
    }
  })
  expect(screen.getByRole('textbox', { name: 'HTTP Proxy' })).toHaveValue(
    'http://canonical.example:8080'
  )
  await act(async () => {
    useAppStore.setState({ settingsSearchQuery: '' })
  })
  await expect(invoke({ viewerId: 7, operation: 'network-proxy.get' })).resolves.toMatchObject({
    state: { forcedOpen: true }
  })
  expect(write).not.toHaveBeenCalled()
})
it('rejects duplicate and unmounted sections before changing drafts', async () => {
  useAppStore.setState({ settingsSearchQuery: 'proxy' })
  render(
    <>
      <Surface />
      <Surface />
    </>
  )
  await expect(
    invoke({ viewerId: 7, operation: 'network-proxy.url-draft', value: 'ambiguous-canary' })
  ).rejects.toThrow('connections_viewer_ambiguous')
  const inputs = document.querySelectorAll<HTMLInputElement>('input')
  expect(inputs).toHaveLength(2)
  for (const input of inputs) {
    expect(input).toHaveValue('')
  }
  cleanup()
  await expect(invoke({ viewerId: 7, operation: 'network-proxy.get' })).rejects.toThrow(
    'connections_surface_unavailable'
  )
  await waitFor(() => expect(write).not.toHaveBeenCalled())
})

it('normalizes native blur and typed URL/bypass commits through the same canonical setting owner', async () => {
  useAppStore.setState({ settingsSearchQuery: 'proxy' })
  write.mockImplementation(async (updates) => {
    const settings = useAppStore.getState().settings
    if (settings) {
      useAppStore.setState({ settings: { ...settings, ...updates } })
    }
  })
  render(<Surface />)
  const url = screen.getByRole('textbox', { name: 'HTTP Proxy' })
  fireEvent.change(url, { target: { value: '  http://native.example:8080  ' } })
  url.focus()
  fireEvent.keyDown(url, { key: 'Enter' })
  await waitFor(() =>
    expect(write).toHaveBeenLastCalledWith({ httpProxyUrl: 'http://native.example:8080' })
  )
  await waitFor(() => expect(url).toHaveValue('http://native.example:8080'))
  await invoke({
    viewerId: 7,
    operation: 'network-proxy.url-draft',
    value: '  socks5://typed:private-canary@proxy.example:1080 '
  })
  const result = await invoke({ viewerId: 7, operation: 'network-proxy.url-commit' })
  expect(result).toMatchObject({ applied: true, persisted: true })
  expect(JSON.stringify(result)).not.toContain('private-canary')
  expect(url).toHaveValue('socks5://typed:private-canary@proxy.example:1080')
  await invoke({
    viewerId: 7,
    operation: 'network-proxy.bypass-draft',
    value: ' localhost;  *.internal\nlocalhost '
  })
  await expect(
    invoke({ viewerId: 7, operation: 'network-proxy.bypass-commit' })
  ).resolves.toMatchObject({ applied: true, persisted: true })
  expect(screen.getByRole('textbox', { name: 'Proxy Bypass Rules' })).toHaveValue(
    'localhost;*.internal;localhost'
  )
})
it('does not confirm invalid URLs, ignored writes or failed canonical reads', async () => {
  useAppStore.setState({ settingsSearchQuery: 'proxy' })
  render(<Surface />)
  await invoke({
    viewerId: 7,
    operation: 'network-proxy.url-draft',
    value: 'invalid-private-canary'
  })
  await expect(
    invoke({ viewerId: 7, operation: 'network-proxy.url-commit' })
  ).resolves.toMatchObject({ applied: false, persisted: false })
  expect(write).not.toHaveBeenCalled()
  await invoke({
    viewerId: 7,
    operation: 'network-proxy.url-draft',
    value: 'http://ignored.example:8080'
  })
  await expect(
    invoke({ viewerId: 7, operation: 'network-proxy.url-commit' })
  ).resolves.toMatchObject({ applied: false, persisted: false })
  vi.mocked(window.api.settings.get).mockRejectedValueOnce(new Error('private-canonical-canary'))
  const result = await invoke({ viewerId: 7, operation: 'network-proxy.url-commit' })
  expect(result).toMatchObject({ applied: false, persisted: false })
  expect(JSON.stringify(result)).not.toContain('private-canonical-canary')
})
it('preserves a newer same-dialog draft and prevents a duplicate native/typed save', async () => {
  useAppStore.setState({ settingsSearchQuery: 'proxy' })
  let finish: (() => void) | undefined
  write.mockImplementationOnce(
    (updates) =>
      new Promise<void>((resolve) => {
        finish = () => {
          const settings = useAppStore.getState().settings
          if (settings) {
            useAppStore.setState({ settings: { ...settings, ...updates } })
          }
          resolve()
        }
      })
  )
  render(<Surface />)
  await invoke({
    viewerId: 7,
    operation: 'network-proxy.url-draft',
    value: 'http://old.example:8080'
  })
  const pending = invoke({ viewerId: 7, operation: 'network-proxy.url-commit' })
  await waitFor(() => expect(write).toHaveBeenCalledOnce())
  fireEvent.blur(screen.getByRole('textbox', { name: 'HTTP Proxy' }))
  await expect(
    invoke({ viewerId: 7, operation: 'network-proxy.url-commit' })
  ).resolves.toMatchObject({ applied: false, persisted: false })
  fireEvent.change(screen.getByRole('textbox', { name: 'HTTP Proxy' }), {
    target: { value: 'http://new.example:8080' }
  })
  await act(async () => {
    finish?.()
  })
  await expect(pending).resolves.toMatchObject({ applied: false, persisted: false })
  expect(screen.getByRole('textbox', { name: 'HTTP Proxy' })).toHaveValue('http://new.example:8080')
})

it('refuses a stale native commit before React observes another canonical settings writer', async () => {
  useAppStore.setState({ settingsSearchQuery: 'proxy' })
  render(<Surface />)
  const url = screen.getByRole('textbox', { name: 'HTTP Proxy' })
  fireEvent.change(url, { target: { value: 'http://stale.example:8080' } })
  await act(async () => {
    const settings = useAppStore.getState().settings
    if (settings) {
      useAppStore.setState({
        settings: { ...settings, httpProxyUrl: 'http://external.example:8080' }
      })
    }
    fireEvent.blur(url)
  })
  expect(write).not.toHaveBeenCalled()
  expect(url).toHaveValue('http://external.example:8080')
})
it('does not acknowledge a save when canonical settings change during its readback', async () => {
  useAppStore.setState({ settingsSearchQuery: 'proxy' })
  write.mockImplementation(async (updates) => {
    const settings = useAppStore.getState().settings
    if (settings) {
      useAppStore.setState({ settings: { ...settings, ...updates } })
    }
  })
  render(<Surface />)
  await invoke({
    viewerId: 7,
    operation: 'network-proxy.url-draft',
    value: 'http://saved.example:8080'
  })
  vi.mocked(window.api.settings.get).mockImplementationOnce(async () => {
    const settings = useAppStore.getState().settings
    if (!settings) {
      throw new Error('missing_fixture_settings')
    }
    useAppStore.setState({
      settings: { ...settings, httpProxyUrl: 'http://new-owner.example:8080' }
    })
    return settings
  })
  await expect(
    invoke({ viewerId: 7, operation: 'network-proxy.url-commit' })
  ).resolves.toMatchObject({ applied: false, persisted: false })
  expect(screen.getByRole('textbox', { name: 'HTTP Proxy' })).toHaveValue(
    'http://new-owner.example:8080'
  )
})
