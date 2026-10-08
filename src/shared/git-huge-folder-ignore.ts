export const KNOWN_HUGE_FOLDER_NAMES = [
  'node_modules',
  '.next',
  'dist',
  'build',
  'target',
  'vendor'
] as const

export function hugeFolderGitignoreAddition(
  folderName: string,
  existingContent: string
): string | null {
  const name = folderName.trim()
  if (!KNOWN_HUGE_FOLDER_NAMES.some((candidate) => candidate === name) || /[\\/\r\n]/.test(name)) {
    throw new Error('Refusing to add unrecognized folder to .gitignore')
  }
  const line = `${name}/`
  if (
    existingContent.split(/\r?\n/).some((entry) => entry.trim() === name || entry.trim() === line)
  ) {
    return null
  }
  return `${existingContent.length > 0 && !existingContent.endsWith('\n') ? '\n' : ''}${line}\n`
}
