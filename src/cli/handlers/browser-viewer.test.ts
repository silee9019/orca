import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { BROWSER_VIEWER_COMMAND_SPECS } from '../specs/browser-viewer'
import { BROWSER_VIEWER_HANDLERS } from './browser-viewer'

const client = new RuntimeClient(join(tmpdir(), 'browser-viewer-fixture'), 60_000, null, null)
async function run(args: string[]) {
  const parsed = parseArgs(['browser', ...args])
  validateCommandAndFlags(BROWSER_VIEWER_COMMAND_SPECS, parsed)
  const handler = BROWSER_VIEWER_HANDLERS[parsed.commandPath.join(' ')]
  if (!handler) {
    throw new Error('Missing browser viewer handler')
  }
  await handler({ flags: parsed.flags, client, cwd: tmpdir(), json: true })
}
afterEach(() => vi.restoreAllMocks())

it.each([
  ...[
    'menu-open',
    'menu-close',
    'switch-confirm',
    'switch-cancel',
    'new-open',
    'new-cancel',
    'new-create',
    'status'
  ].map((action) => ({
    args: [
      'profile-ui',
      '--action',
      action,
      '--page',
      'p1',
      ...(['switch-confirm', 'new-create'].includes(action) ? ['--confirm'] : [])
    ],
    command: { operation: 'profile-ui', page: 'p1', command: { action } }
  })),
  {
    args: ['profile-ui', '--action', 'select', '--profile', 'other', '--page', 'p1'],
    command: {
      operation: 'profile-ui',
      page: 'p1',
      command: { action: 'select', profile: 'other' }
    }
  },
  {
    args: ['profile-ui', '--action', 'new-name', '--name', '', '--page', 'p1'],
    command: { operation: 'profile-ui', page: 'p1', command: { action: 'new-name', name: '' } }
  },
  {
    args: ['markup', 'text-commit', '--page', 'p1', '--text', 'annotation text'],
    command: {
      operation: 'markup-editor',
      page: 'p1',
      command: { action: 'text-commit', text: 'annotation text' }
    }
  },
  {
    args: ['markup', 'text-cancel', '--page', 'p1'],
    command: { operation: 'markup-editor', page: 'p1', command: { action: 'text-cancel' } }
  },
  ...['open', 'close', 'copy', 'clear', 'send-menu-open', 'send-menu-close', 'status'].map(
    (action) => ({
      args: [
        'annotation',
        'tray',
        '--page',
        'p1',
        '--action',
        action,
        ...(action === 'clear' ? ['--confirm'] : [])
      ],
      command: { operation: 'annotation-tray', page: 'p1', action }
    })
  ),
  ...['open', 'dismiss', 'submit', 'status', 'next', 'previous'].map((action) => ({
    args: ['address', '--action', action, '--page', 'p1'],
    command: { operation: 'address', page: 'p1', command: { action } }
  })),
  ...['preview', 'select', 'highlight'].map((action) => ({
    args: ['address', '--action', action, '--page', 'p1', '--index', '1'],
    command: { operation: 'address', page: 'p1', command: { action, index: 1 } }
  })),
  {
    args: ['address', '--action', 'draft', '--page', 'p1', '--text', ''],
    command: { operation: 'address', page: 'p1', command: { action: 'draft', text: '' } }
  },
  ...['undo', 'redo', 'clear', 'editor-status', 'copy'].map((action) => ({
    args: ['markup', action, '--page', 'p1'],
    command: {
      operation: 'markup-editor',
      page: 'p1',
      command: { action: action === 'editor-status' ? 'status' : action }
    }
  })),
  ...[
    { action: 'tool', value: 'rect' },
    { action: 'color', value: '#3b82f6' },
    { action: 'width', value: 8 },
    { action: 'font-size', value: 32 }
  ].map(({ action, value }) => ({
    args: ['markup', action, '--page', 'p1', `--${action}`, String(value)],
    command: { operation: 'markup-editor', page: 'p1', command: { action, value } }
  })),
  ...['start', 'cancel', 'status'].map((action) => ({
    args: ['markup', action, '--page', 'p1'],
    command: { operation: 'markup', page: 'p1', action }
  })),
  {
    args: ['annotation', 'draft-status', '--page', 'p1'],
    command: { operation: 'annotation-draft', page: 'p1', action: 'status' }
  },
  {
    args: ['annotation', 'draft-cancel', '--page', 'p1'],
    command: { operation: 'annotation-draft', page: 'p1', action: 'cancel' }
  },
  {
    args: ['annotation', 'add', '--page', 'p1', '--comment', '', '--intent', 'question'],
    command: { operation: 'annotation-add', page: 'p1', comment: '', intent: 'question' }
  },
  ...['start', 'cancel', 'rearm', 'exit', 'status', 'copy', 'copy-screenshot'].map((action) => ({
    args: ['grab', action, '--page', 'p1', ...(action === 'start' ? ['--intent', 'annotate'] : [])],
    command: {
      operation: 'grab',
      page: 'p1',
      action,
      ...(action === 'start' ? { intent: 'annotate' } : {})
    }
  })),
  ...['back', 'forward', 'reload-button', 'reload', 'hard-reload'].map((action) => ({
    args: ['toolbar-nav', '--page', 'p1', '--action', action],
    command: { operation: 'toolbar-navigation', page: 'p1', action }
  })),
  ...['open', 'next', 'previous', 'close', 'status'].map((action) => ({
    args: ['find-ui', action, '--page', 'p1'],
    command: { operation: 'find', page: 'p1', action }
  })),
  {
    args: ['find-ui', 'query', '--page', 'p1', '--query', ''],
    command: { operation: 'find-query', page: 'p1', query: '' }
  },
  {
    args: ['annotation', 'list', '--page', 'p1'],
    command: { operation: 'annotation-list', page: 'p1' }
  },
  {
    args: [
      'annotation',
      'update',
      '--page',
      'p1',
      '--annotation',
      'a1',
      '--comment',
      'edit',
      '--intent',
      'fix'
    ],
    command: {
      operation: 'annotation-update',
      page: 'p1',
      annotationId: 'a1',
      comment: 'edit',
      intent: 'fix'
    }
  },
  {
    args: ['annotation', 'rm', '--page', 'p1', '--annotation', 'a1', '--confirm'],
    command: { operation: 'annotation-delete', page: 'p1', annotationId: 'a1' }
  },
  {
    args: ['annotation', 'clear', '--page', 'p1', '--confirm'],
    command: { operation: 'annotation-clear', page: 'p1' }
  },
  { args: ['history', 'list'], command: { operation: 'history-list' } },
  { args: ['history', 'clear', '--confirm'], command: { operation: 'history-clear' } },
  {
    args: ['viewport-preset', 'set', '--page', 'p1', '--preset', 'default'],
    command: { operation: 'viewport-preset', page: 'p1', preset: null }
  }
])(
  'sends the typed $command.operation request to the explicit viewer',
  async ({ args, command }) => {
    const response = {
      id: 'fixture',
      ok: true as const,
      result: { viewer: 'host', viewerId: 1, applied: true, persisted: false, rendered: false },
      _meta: { runtimeId: 'fixture' }
    }
    const call = vi.spyOn(client, 'call').mockResolvedValue(response)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await run([...args, '--viewer', 'host'])
    expect(call).toHaveBeenCalledExactlyOnceWith('ui.browserViewer', { viewer: 'host', ...command })
  }
)

it.each([
  ['annotation', 'tray', '--page', 'p1', '--action', 'clear', '--viewer', 'host'],
  ['address', '--action', 'draft', '--page', 'p1', '--viewer', 'host'],
  ['address', '--action', 'select', '--page', 'p1', '--viewer', 'host', '--index', '-1'],
  ['address', '--action', 'invalid', '--page', 'p1', '--viewer', 'host'],
  ['grab', 'start', '--page', 'p1', '--viewer', 'host'],
  ['grab', 'start', '--page', 'p1', '--viewer', 'host', '--intent', 'invalid'],
  ['annotation', 'list', '--page', 'p1'],
  ['annotation', 'clear', '--page', 'p1', '--viewer', 'host'],
  ['history', 'list', '--viewer', 'clients'],
  ['viewport-preset', 'set', '--page', 'p1', '--preset', 'invalid', '--viewer', 'host']
])(
  'rejects missing viewer, confirmation, and invalid enum before transport %j',
  async (...args) => {
    const call = vi.spyOn(client, 'call')
    await expect(run(args)).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  }
)

it('reads a WebAuthn credential from a file and never prints it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'orca-webauthn-fixture-'))
  try {
    const file = join(dir, 'credential.txt')
    await writeFile(file, 'synthetic-fixture-credential')
    const call = vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { applied: true },
      _meta: { runtimeId: 'fixture' }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await run([
      'webauthn',
      'respond',
      '--viewer',
      'host',
      '--request',
      'request-1',
      '--credential-file',
      file,
      '--confirm'
    ])
    expect(call).toHaveBeenCalledExactlyOnceWith('ui.browserViewer', {
      viewer: 'host',
      operation: 'webauthn-respond',
      requestId: 'request-1',
      credentialId: 'synthetic-fixture-credential'
    })
    expect(log).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(
        { id: 'fixture', ok: true, result: { applied: true }, _meta: { runtimeId: 'fixture' } },
        null,
        2
      )
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it.each(['switch-confirm', 'new-create'])(
  'requires explicit confirmation for profile-ui %s',
  async (action) => {
    const call = vi.spyOn(client, 'call')
    await expect(
      run(['profile-ui', '--viewer', 'host', '--page', 'p1', '--action', action])
    ).rejects.toThrow('--confirm')
    expect(call).not.toHaveBeenCalled()
  }
)
