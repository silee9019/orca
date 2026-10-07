import { BROWSER_PALETTE_COMMAND_SPECS } from '../../src/cli/specs/browser-palette'
import { BROWSER_PALETTE_HANDLERS } from '../../src/cli/handlers/browser-palette'
import { REMOTE_FILE_PICKER_COMMAND_SPECS } from '../../src/cli/specs/remote-file-picker'
import { REMOTE_FILE_PICKER_HANDLERS } from '../../src/cli/handlers/remote-file-picker'
import { createServer, type Socket } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { BROWSER_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/browser-viewer'
import { BROWSER_REMOTE_PANE_COMMAND_SPECS } from '../../src/cli/specs/browser-remote-pane'
import { BROWSER_REMOTE_PANE_HANDLERS } from '../../src/cli/handlers/browser-remote-pane'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { getRuntimeMetadataPath } from '../../src/shared/runtime-bootstrap'
const Request = z.object({
  id: z.string(),
  method: z.string(),
  params: z.unknown(),
  authToken: z.literal('fixture-token')
})
export async function createRemotePaneCliSocket(runtime: OrcaRuntimeService) {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-remote-pane-'))
  let dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_VIEWER_METHODS })
  const endpoint =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\${path.basename(dir)}`
      : path.join(dir, 'runtime.sock')
  const connectedClients = new Set<Socket>()
  const server = createServer((socket) => {
    connectedClients.add(socket)
    socket.on('close', () => connectedClients.delete(socket))
    socket.setEncoding('utf8')
    let pending = ''
    socket.on('data', (chunk) => {
      pending += chunk.toString()
      const index = pending.indexOf('\n')
      if (index === -1) {
        return
      }
      const request = Request.parse(JSON.parse(pending.slice(0, index)))
      void dispatcher
        .dispatch(request)
        .then((response) => socket.end(`${JSON.stringify(response)}\n`))
    })
  })
  const close = async () => {
    for (const socket of connectedClients) {
      socket.destroy()
    }
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
    await rm(dir, { recursive: true, force: true })
  }
  try {
    server.listen(endpoint)
    await once(server, 'listening')
    await writeFile(
      getRuntimeMetadataPath(dir),
      JSON.stringify({
        runtimeId: runtime.getRuntimeId(),
        pid: process.pid,
        transports: [{ kind: process.platform === 'win32' ? 'named-pipe' : 'unix', endpoint }],
        authToken: 'fixture-token',
        startedAt: Date.now()
      })
    )
  } catch (error) {
    await close()
    throw error
  }
  const run = async (
    environmentId: string,
    action = 'reconnect',
    remotePage = 'none',
    extra: string[] = []
  ) => {
    const specs = BROWSER_REMOTE_PANE_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'remote-pane',
        '--viewer',
        'host',
        '--page',
        'local-page',
        '--runtime-environment',
        environmentId,
        '--remote-page',
        remotePage,
        '--action',
        action,
        ...extra
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    const handler = BROWSER_REMOTE_PANE_HANDLERS[parsed.commandPath.join(' ')]
    await handler({
      ...parsed,
      client: new RuntimeClient(dir),
      cwd: path.join(dir, 'folder'),
      json: true
    })
  }
  const runPicker = async (extra: string[]) => {
    const specs = REMOTE_FILE_PICKER_COMMAND_SPECS
    const parsed = parseArgs(
      ['file', 'remote-picker', '--viewer', 'host', ...extra],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await REMOTE_FILE_PICKER_HANDLERS[parsed.commandPath.join(' ')]({
      ...parsed,
      client: new RuntimeClient(dir),
      cwd: path.join(dir, 'folder'),
      json: true
    })
  }
  const runPalette = async (extra: string[]) => {
    const specs = BROWSER_PALETTE_COMMAND_SPECS
    const parsed = parseArgs(
      ['browser', 'palette-select', '--viewer', 'host', ...extra],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_PALETTE_HANDLERS[parsed.commandPath.join(' ')]({
      ...parsed,
      client: new RuntimeClient(dir),
      cwd: path.join(dir, 'folder'),
      json: true
    })
  }
  return {
    runPalette,
    runPicker,
    run,
    close,
    useLegacyPeer: () => {
      dispatcher = new RpcDispatcher({ runtime, methods: [] })
    }
  }
}
