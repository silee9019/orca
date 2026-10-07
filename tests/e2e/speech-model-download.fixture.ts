import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { vi } from 'vitest'
import * as catalog from '../../src/main/speech/model-catalog'
import { ModelManager } from '../../src/main/speech/model-manager'

const payload = Buffer.from('fixture model bytes')
export function installTinySpeechManifest(modelId: string): void {
  const original = catalog.getCatalogModel
  const manifest = original(modelId)
  if (!manifest?.downloadFiles?.length) {
    throw new Error('Missing fixture model metadata')
  }
  const downloadFiles = manifest.downloadFiles.map((file) => ({
    ...file,
    url: `https://fixture.invalid/${file.name}`,
    sizeBytes: payload.length,
    sha256: createHash('sha256').update(payload).digest('hex')
  }))
  const tiny = { ...manifest, downloadFiles, sizeBytes: payload.length * downloadFiles.length }
  vi.spyOn(catalog, 'getCatalogModel').mockImplementation((id) =>
    id === modelId ? tiny : original(id)
  )
}

export class FixtureSpeechModelManager extends ModelManager {
  private releaseDownload: (() => void) | undefined
  private gate = new Promise<void>((resolve) => {
    this.releaseDownload = resolve
  })
  readonly receivedFiles: string[] = []
  release(): void {
    this.releaseDownload?.()
  }
  protected override async downloadFile(
    url: string,
    dest: string,
    expectedSize: number,
    modelId: string,
    isAborted: () => boolean,
    signal?: AbortSignal
  ): Promise<void> {
    if (!url.startsWith('https://fixture.invalid/') || expectedSize !== payload.length) {
      throw new Error('Fixture refuses external download')
    }
    await this.gate
    if (signal?.aborted || isAborted()) {
      throw new Error('Fixture download aborted')
    }
    writeFileSync(dest, payload)
    this.receivedFiles.push(dest)
    this.reportDownloadProgress(modelId, 0.5)
  }
}
