import { watch, type FSWatcher } from 'node:fs'
export function watchLocalLogFile(
  filePath: string,
  onChange: (eventType: 'change' | 'rename') => void,
  onError: () => void
): FSWatcher {
  const watcher = watch(filePath, (eventType) => onChange(eventType))
  watcher.on('error', onError)
  return watcher
}
