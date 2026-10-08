import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs } from './args'
import { SETUP_GUIDE_COMMAND_SPECS } from './specs/setup-guide-viewer'
import { SETUP_GUIDE_HANDLERS } from './handlers/setup-guide-viewer'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { SetupGuideParams } from '../shared/rpc-contract/setup-guide-params'
const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
const run = (flags = new Map<string, string | boolean>([['viewer', 'host']])) =>
  SETUP_GUIDE_HANDLERS['ui setup-guide open']({ client, flags, cwd: '/unused', json: true })
afterEach(() => {
  call.mockReset()
  output.mockClear()
})
it('parses an explicit viewer and preserves host metadata and rendered ACK', async () => {
  const parsed = parseArgs(
    ['ui', 'setup-guide', 'open', '--viewer', 'host', '--json'],
    SETUP_GUIDE_COMMAND_SPECS.map((spec) => spec.path),
    SETUP_GUIDE_COMMAND_SPECS
  )
  expect(parsed.commandPath).toEqual(['ui', 'setup-guide', 'open'])
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target' },
    result: {
      viewer: 'host',
      viewerId: 7,
      applied: true,
      source: 'help_menu',
      dialogPresent: true,
      contentPresent: true,
      stepId: 'default-agent'
    }
  })
  await run(parsed.flags)
  expect(call).toHaveBeenCalledExactlyOnceWith('ui.setupGuideViewer', {
    viewer: 'host',
    operation: 'open'
  })
  expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({
    _meta: { runtimeId: 'target' },
    result: { viewerId: 7, applied: true }
  })
})
it('refuses missing or other viewers and arbitrary modal inputs', async () => {
  for (const flags of [new Map<string, string>(), new Map([['viewer', 'clients']])]) {
    await expect(run(flags)).rejects.toThrow()
  }
  expect(
    SetupGuideParams.safeParse({ viewer: 'host', operation: 'open', modal: 'settings' }).success
  ).toBe(false)
  expect(call).not.toHaveBeenCalled()
})
it('refuses an old runtime without falling back to another viewer', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old'))
  await expect(run()).rejects.toThrow('Update the target runtime')
  expect(call).toHaveBeenCalledTimes(1)
})

it('parses and dispatches an original step with an explicit viewer', async () => {
  const parsed = parseArgs(
    ['ui', 'setup-guide', 'select-step', '--step', 'browser', '--viewer', 'host'],
    SETUP_GUIDE_COMMAND_SPECS.map((spec) => spec.path),
    SETUP_GUIDE_COMMAND_SPECS
  )
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target' },
    result: {
      viewer: 'host',
      viewerId: 7,
      applied: true,
      source: 'help_menu',
      dialogPresent: true,
      contentPresent: true,
      stepId: 'browser'
    }
  })
  await SETUP_GUIDE_HANDLERS['ui setup-guide select-step']({
    client,
    flags: parsed.flags,
    cwd: '/unused',
    json: true
  })
  expect(call).toHaveBeenCalledExactlyOnceWith('ui.setupGuideViewer', {
    viewer: 'host',
    operation: 'select-step',
    stepId: 'browser'
  })
})
it('rejects arbitrary steps and preserves an older peer refusal without fallback', async () => {
  const handler = SETUP_GUIDE_HANDLERS['ui setup-guide select-step']
  await expect(
    handler({
      client,
      flags: new Map([
        ['viewer', 'host'],
        ['step', 'arbitrary']
      ]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
  call.mockRejectedValueOnce(new RuntimeClientError('invalid_params', 'unsupported operation'))
  await expect(
    handler({
      client,
      flags: new Map([
        ['viewer', 'host'],
        ['step', 'browser']
      ]),
      cwd: '/unused',
      json: true
    })
  ).rejects.toThrow('unsupported operation')
  expect(call).toHaveBeenCalledTimes(1)
})

it('dispatches fixed hide-sidebar and preserves optimistic-only acknowledgement', async () => {
  const parsed = parseArgs(
    ['ui', 'setup-guide', 'hide-sidebar', '--viewer', 'host'],
    SETUP_GUIDE_COMMAND_SPECS.map((spec) => spec.path),
    SETUP_GUIDE_COMMAND_SPECS
  )
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target' },
    result: {
      viewer: 'host',
      viewerId: 7,
      applied: true,
      source: 'help_menu',
      dialogPresent: true,
      contentPresent: true,
      stepId: 'browser',
      sidebarDismissed: true,
      changed: true,
      writeOutcome: 'unverified',
      diskPersistence: 'unverified',
      reportText: 'strip'
    }
  })
  await SETUP_GUIDE_HANDLERS['ui setup-guide hide-sidebar']({
    client,
    flags: parsed.flags,
    cwd: '/unused',
    json: true
  })
  expect(call).toHaveBeenCalledExactlyOnceWith('ui.setupGuideViewer', {
    viewer: 'host',
    operation: 'hide-sidebar'
  })
  const response = JSON.parse(output.mock.calls.at(-1)?.[0])
  expect(response.result).toMatchObject({
    sidebarDismissed: true,
    writeOutcome: 'unverified',
    diskPersistence: 'unverified'
  })
  expect(response.result).not.toHaveProperty('reportText')
})
it('rejects an incomplete hide acknowledgement and keeps an old peer refusal', async () => {
  const handler = SETUP_GUIDE_HANDLERS['ui setup-guide hide-sidebar']
  const context = { client, flags: new Map([['viewer', 'host']]), cwd: '/unused', json: true }
  call.mockResolvedValueOnce({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target' },
    result: {
      viewer: 'host',
      viewerId: 7,
      applied: true,
      source: 'help_menu',
      dialogPresent: true,
      contentPresent: true,
      stepId: 'browser'
    }
  })
  await expect(handler(context)).rejects.toThrow()
  call.mockRejectedValueOnce(new RuntimeClientError('invalid_params', 'unsupported operation'))
  await expect(handler(context)).rejects.toThrow('unsupported operation')
  expect(call).toHaveBeenCalledTimes(2)
})

it('parses an explicit sidebar-entry hide and validates its separate ACK', async () => {
  const parsed = parseArgs(
    ['ui', 'setup-guide', 'hide-sidebar-entry', '--viewer', 'host'],
    SETUP_GUIDE_COMMAND_SPECS.map((spec) => spec.path),
    SETUP_GUIDE_COMMAND_SPECS
  )
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target' },
    result: {
      viewer: 'host',
      viewerId: 7,
      applied: true,
      source: 'sidebar',
      dialogPresent: false,
      contentPresent: false,
      stepId: null,
      sidebarDismissed: true,
      changed: true,
      sidebarEntryPresent: false,
      menuPresent: false,
      writeOutcome: 'unverified',
      diskPersistence: 'unverified'
    }
  })
  await SETUP_GUIDE_HANDLERS['ui setup-guide hide-sidebar-entry']({
    client,
    flags: parsed.flags,
    cwd: '/unused',
    json: true
  })
  expect(call).toHaveBeenCalledExactlyOnceWith('ui.setupGuideViewer', {
    viewer: 'host',
    operation: 'hide-sidebar-entry'
  })
  expect(JSON.parse(output.mock.calls.at(-1)?.[0]).result).toMatchObject({
    source: 'sidebar',
    sidebarEntryPresent: false,
    menuPresent: false,
    writeOutcome: 'unverified'
  })
})
it('does not accept a modal ACK as a sidebar-entry hide or retry an old peer', async () => {
  const handler = SETUP_GUIDE_HANDLERS['ui setup-guide hide-sidebar-entry']
  const context = { client, flags: new Map([['viewer', 'host']]), cwd: '/unused', json: true }
  call.mockResolvedValueOnce({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'target' },
    result: {
      viewer: 'host',
      viewerId: 7,
      applied: true,
      source: 'help_menu',
      dialogPresent: true,
      contentPresent: true,
      stepId: 'browser',
      sidebarDismissed: true,
      changed: true,
      writeOutcome: 'unverified',
      diskPersistence: 'unverified'
    }
  })
  await expect(handler(context)).rejects.toThrow()
  call.mockRejectedValueOnce(new RuntimeClientError('invalid_params', 'unsupported operation'))
  await expect(handler(context)).rejects.toThrow('unsupported operation')
  expect(call).toHaveBeenCalledTimes(2)
})
