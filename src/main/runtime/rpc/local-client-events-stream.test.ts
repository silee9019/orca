import { createConnection } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { UnixSocketTransport } from './unix-socket-transport'

const resources: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of resources.splice(0).toReversed()) {
    await close()
  }
})
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'orca-connections-stream-'))
  resources.push(() => rm(dir, { recursive: true, force: true }))
  const endpoint =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\orca-connections-${randomUUID()}`
      : join(dir, 'test.sock')
  const server = new UnixSocketTransport({
    endpoint,
    kind: process.platform === 'win32' ? 'named-pipe' : 'unix'
  })
  await server.start()
  resources.push(() => server.stop())
  const socket = createConnection(endpoint)
  resources.push(async () => {
    socket.destroy()
  })
  socket.setEncoding('utf8')
  const frames: string[] = []
  socket.on('data', (value) => {
    frames.push(String(value))
  })
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  return { server, socket, frames }
}
it('retains multiple client-event frames until explicit completion and drops late writes', async () => {
  const { server, socket, frames } = await fixture()
  let emit: ((value: string) => void) | undefined
  let finish: (() => void) | undefined
  let delivered: (() => void) | undefined
  const ready = new Promise<void>((resolve) => {
    delivered = resolve
  })
  server.onMessage((_message, _reply, context) => {
    emit = context?.clientEventStream?.emit
    finish = context?.clientEventStream?.finish
    emit?.('ready')
    emit?.('ssh-event')
    delivered?.()
  })
  socket.write('subscribe\n')
  await ready
  await new Promise<void>((resolve) => setImmediate(resolve))
  emit?.('second-event')
  finish?.()
  emit?.('late-private-canary')
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  expect(frames.join('')).toBe('ready\nssh-event\nsecond-event\n')
})
it('aborts the existing dispatch signal when a subscriber closes its socket', async () => {
  const { server, socket } = await fixture()
  let aborted: (() => void) | undefined
  const done = new Promise<void>((resolve) => {
    aborted = resolve
  })
  server.onMessage((_message, _reply, context) => {
    context?.signal.addEventListener('abort', () => aborted?.(), { once: true })
    context?.clientEventStream?.emit('ready')
  })
  socket.write('subscribe\n')
  await new Promise<void>((resolve) => socket.once('data', () => resolve()))
  socket.destroy()
  await done
})
it('preserves one-shot replies for ordinary requests', async () => {
  const { server, socket, frames } = await fixture()
  server.onMessage((_message, reply, context) => {
    reply('first')
    reply('second')
    context?.clientEventStream?.emit('late')
  })
  socket.write('ordinary\n')
  await new Promise<void>((resolve) => socket.once('data', () => resolve()))
  expect(frames.join('')).toBe('first\n')
})
