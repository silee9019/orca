// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { OpenCodeGoCredentials } from '../components/settings/accounts-pane-opencode-credentials'
import { BitbucketCredentialsDialog } from '../components/settings/bitbucket-credentials-dialog'
import { AgentDefaultEnvInput } from '../components/settings/AgentLaunchDefaultsEditor'
import { applyMountedAccountsViewerAction } from './account-mounted-viewer-actions'

vi.mock('../store', () => ({
  useAppStore: (select: (state: { settings: null; settingsSearchQuery: string }) => unknown) =>
    select({ settings: null, settingsSearchQuery: '' })
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('changes only the mounted OpenCode draft, rejects ambiguity and unregisters on unmount', async () => {
  const save = vi.fn()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      opencodeGoCredentials: {
        getStatus: vi.fn(async () => ({ apiKeyConfigured: false })),
        saveApiKey: save
      }
    }
  })
  const view = render(<OpenCodeGoCredentials onSaved={vi.fn()} />)
  await screen.findByText('Not saved')
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-opencode-go-draft',
      value: 'fixture-private-draft'
    })
  })
  const input = screen.getByLabelText('OpenCode Go API key')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Missing fixture input')
  }
  expect(input.value).toBe('fixture-private-draft')
  expect(save).not.toHaveBeenCalled()
  render(<OpenCodeGoCredentials onSaved={vi.fn()} />)
  await expect(
    applyMountedAccountsViewerAction({ type: 'account-opencode-go-draft', value: 'other' })
  ).rejects.toThrow('ambiguous')
  cleanup()
  await expect(
    applyMountedAccountsViewerAction({ type: 'account-opencode-go-draft', value: 'other' })
  ).rejects.toThrow('unavailable')
  view.unmount()
})

it('reuses Bitbucket draft setters, mode reset and dirty outside-dismiss protection without saving', async () => {
  const connect = vi.fn()
  Object.defineProperty(window, 'api', { configurable: true, value: { bitbucket: { connect } } })
  function Form() {
    const [open, setOpen] = useState(true)
    return <BitbucketCredentialsDialog open={open} onOpenChange={setOpen} />
  }
  render(<Form />)
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-bitbucket-draft',
      field: 'email',
      value: 'fixture@example.invalid'
    })
    await applyMountedAccountsViewerAction({
      type: 'account-bitbucket-draft',
      field: 'base-url',
      value: 'https://fixture.invalid/api'
    })
  })
  const email = screen.getByLabelText('Atlassian account email')
  const baseUrl = screen.getByLabelText('API base URL (optional)')
  if (!(email instanceof HTMLInputElement) || !(baseUrl instanceof HTMLInputElement)) {
    throw new Error('Missing Bitbucket fixture inputs')
  }
  expect(email.value).toBe('fixture@example.invalid')
  expect(baseUrl.value).toBe('https://fixture.invalid/api')
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-bitbucket-draft',
      field: 'api-token',
      value: 'private-basic-draft'
    })
  })
  const apiToken = screen.getByLabelText('API token')
  if (!(apiToken instanceof HTMLInputElement)) {
    throw new Error('Missing fixture token input')
  }
  expect(apiToken.value).toBe('private-basic-draft')
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-bitbucket-draft',
      field: 'auth-mode',
      value: 'token'
    })
  })
  const token = screen.getByLabelText('Access token')
  if (!(token instanceof HTMLInputElement)) {
    throw new Error('Missing fixture access token input')
  }
  expect(token.value).toBe('')
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-bitbucket-draft',
      field: 'access-token',
      value: 'private-access-draft'
    })
  })
  await act(async () => {
    expect(
      await applyMountedAccountsViewerAction({ type: 'account-bitbucket-outside-dismiss' })
    ).toEqual({ prevented: true })
  })
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => {
    await applyMountedAccountsViewerAction({ type: 'account-bitbucket-dialog', open: false })
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await expect(
    applyMountedAccountsViewerAction({
      type: 'account-bitbucket-draft',
      field: 'access-token',
      value: 'hidden'
    })
  ).rejects.toThrow('unavailable')
  await act(async () => {
    await applyMountedAccountsViewerAction({ type: 'account-bitbucket-dialog', open: true })
  })
  const resetToken = screen.getByLabelText('API token')
  if (!(resetToken instanceof HTMLInputElement)) {
    throw new Error('Missing reset fixture input')
  }
  expect(resetToken.value).toBe('')
  await act(async () => {
    expect(
      await applyMountedAccountsViewerAction({ type: 'account-bitbucket-outside-dismiss' })
    ).toEqual({ prevented: false })
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(connect).not.toHaveBeenCalled()
})

it('updates the exact mounted agent environment draft without committing it', async () => {
  const onSaveEnv = vi.fn()
  const view = render(
    <AgentDefaultEnvInput agent="claude" defaultEnv={{}} envOverride={{}} onSaveEnv={onSaveEnv} />
  )
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-agent-env-draft',
      agent: 'claude',
      value: 'TOKEN=fixture-private-draft'
    })
  })
  const input = screen.getByRole('textbox')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Missing env fixture input')
  }
  expect(input.value).toBe('TOKEN=fixture-private-draft')
  expect(onSaveEnv).not.toHaveBeenCalled()
  view.unmount()
  await expect(
    applyMountedAccountsViewerAction({
      type: 'account-agent-env-draft',
      agent: 'claude',
      value: ''
    })
  ).rejects.toThrow('unavailable')
})
