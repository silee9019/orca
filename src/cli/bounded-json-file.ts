import { open } from 'node:fs/promises'
import { RuntimeClientError } from './runtime-client'

export async function readBoundedCliJsonFile(path: string, maxBytes: number): Promise<unknown> {
  const file = await open(path, 'r')
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size > maxBytes) {
      throw new RuntimeClientError('invalid_argument', 'CLI input must be a bounded regular file')
    }
    const buffer = Buffer.alloc(maxBytes + 1)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    if (bytesRead > maxBytes) {
      throw new RuntimeClientError('invalid_argument', 'CLI input exceeds the size limit')
    }
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'))
  } finally {
    await file.close()
  }
}
