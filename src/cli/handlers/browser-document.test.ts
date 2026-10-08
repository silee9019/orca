import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { BROWSER_DOCUMENT_COMMAND_SPECS } from '../specs/browser-document'
import { BROWSER_DOCUMENT_HANDLERS } from './browser-document'

afterEach(() => vi.restoreAllMocks())
const client = new RuntimeClient(join(tmpdir(), 'document-parser-fixture'), 5000, null, null)
async function invoke(flags: string[]): Promise<void> {
  const parsed = parseArgs(
    ['browser', 'document', ...flags],
    BROWSER_DOCUMENT_COMMAND_SPECS.map((spec) => spec.path)
  )
  validateCommandAndFlags(BROWSER_DOCUMENT_COMMAND_SPECS, parsed)
  const handler = BROWSER_DOCUMENT_HANDLERS['browser document']
  if (!handler) {
    throw new Error('missing document handler')
  }
  await handler({ flags: parsed.flags, client, cwd: tmpdir(), json: true })
}
it('validates the viewer, page and exact grant confirmation before transport', async () => {
  const call = vi.spyOn(client, 'call')
  for (const flags of [
    ['--viewer', 'runtime:other', '--page', 'p1', '--action', 'status'],
    ['--viewer', 'host', '--action', 'status'],
    ['--viewer', 'host', '--page', 'p1', '--action', 'evaluate'],
    [
      '--viewer',
      'host',
      '--page',
      'p1',
      '--action',
      'directory-allow',
      '--paths',
      'assets/a.css',
      '--confirm-page',
      'p2'
    ]
  ]) {
    await expect(invoke(flags)).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})
