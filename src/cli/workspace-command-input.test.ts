import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { RuntimeClient } from './runtime-client'
import type { HandlerContext } from './dispatch'
import { readWorkspaceCommandInput } from './workspace-command-input'

let directory: string
let input: string
let ctx: HandlerContext
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-json-input-'))
  input = join(directory, 'input.json')
  ctx = {
    client: new RuntimeClient(directory),
    cwd: directory,
    json: true,
    flags: new Map([['params-file', 'input.json']])
  }
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
it('reads UTF-8 and empty values from a path relative to the caller', async () => {
  await writeFile(input, JSON.stringify({ text: '작업', empty: '' }))
  await expect(
    readWorkspaceCommandInput(ctx, z.object({ text: z.string(), empty: z.string() }))
  ).resolves.toEqual({ text: '작업', empty: '' })
})
it('bounds file input and rejects directories', async () => {
  await writeFile(input, Buffer.alloc(8 * 1024 * 1024 + 1, 32))
  await expect(readWorkspaceCommandInput(ctx, z.unknown())).rejects.toThrow('8 MiB')
  ctx.flags.set('params-file', '.')
  await expect(readWorkspaceCommandInput(ctx, z.unknown())).rejects.toThrow()
})
it('does not include malformed credentials or rejected values in errors', async () => {
  await writeFile(input, '{"key":"canary-secret"')
  await expect(readWorkspaceCommandInput(ctx, z.unknown())).rejects.toThrow('valid JSON')
  await expect(readWorkspaceCommandInput(ctx, z.unknown())).rejects.not.toThrow('canary-secret')
  await writeFile(input, '{"key":"canary-secret"}')
  await expect(readWorkspaceCommandInput(ctx, z.object({ key: z.number() }))).rejects.toMatchObject(
    { code: 'invalid_argument', data: { fields: ['key'] } }
  )
  await expect(readWorkspaceCommandInput(ctx, z.object({ key: z.number() }))).rejects.not.toThrow(
    'canary-secret'
  )
})
