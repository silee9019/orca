import { createServer, type Socket } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { EMULATOR_METHODS } from '../../src/main/runtime/rpc/methods/emulator'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { EMULATOR_COMMAND_SPECS } from '../../src/cli/specs/emulator'
import { EMULATOR_CONTROL_HANDLERS } from '../../src/cli/handlers/emulator-control'
import { getRuntimeMetadataPath } from '../../src/shared/runtime-bootstrap'

const Request = z.object({
  id: z.string(),
  method: z.string(),
  params: z.unknown(),
  authToken: z.literal('fixture-token')
})
export async function createEmulatorViewerCliSocket(runtime: OrcaRuntimeService) {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-emulator-viewer-'))
  let dispatcher = new RpcDispatcher({ runtime, methods: EMULATOR_METHODS })
  const endpoint =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\${path.basename(dir)}`
      : path.join(dir, 'runtime.sock')
  const clients = new Set<Socket>()
  const server = createServer((socket) => {
    clients.add(socket)
    socket.once('close', () => clients.delete(socket))
    socket.setEncoding('utf8')
    let pending = ''
    socket.on('data', (chunk) => {
      pending += chunk.toString()
      const end = pending.indexOf('\n')
      if (end === -1) {
        return
      }
      const request = Request.parse(JSON.parse(pending.slice(0, end)))
      void dispatcher
        .dispatch(request)
        .then((response) => socket.end(`${JSON.stringify(response)}\n`))
    })
  })
  const close = async () => {
    for (const socket of clients) {
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
  const client = new RuntimeClient(dir)
  return {
    client,
    close,
    useLegacyPeer: () => {
      dispatcher = new RpcDispatcher({ runtime, methods: [] })
    },
    run: async (args: string[]) => {
      const specs = EMULATOR_COMMAND_SPECS
      const parsed = parseArgs(
        ['emulator', ...args],
        specs.map((spec) => spec.path),
        specs
      )
      validateCommandAndFlags(specs, parsed)
      await EMULATOR_CONTROL_HANDLERS[parsed.commandPath.join(' ')]({
        ...parsed,
        client,
        cwd: dir,
        json: true
      })
    }
  }
}
