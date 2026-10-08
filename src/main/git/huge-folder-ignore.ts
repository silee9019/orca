import { existsSync } from 'node:fs'
import { appendFile, readFile, stat } from 'node:fs/promises'
import * as path from 'node:path'
import { checkIgnoredPaths } from './check-ignored-paths'
import type { GitRuntimeOptions } from './git-runtime-options'
import {
  KNOWN_HUGE_FOLDER_NAMES,
  hugeFolderGitignoreAddition
} from '../../shared/git-huge-folder-ignore'

/**
 * Return the relative names of known-huge folders that exist in the worktree and
 * are NOT already git-ignored — candidates to offer adding to .gitignore.
 */
export async function findKnownHugeFolderPathsToIgnore(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<string[]> {
  const existing: string[] = []
  for (const name of KNOWN_HUGE_FOLDER_NAMES) {
    const full = path.join(worktreePath, name)
    if (!existsSync(full)) {
      continue
    }
    try {
      if ((await stat(full)).isDirectory()) {
        existing.push(name)
      }
    } catch {
      // ignore — folder vanished mid-check
    }
  }
  if (existing.length === 0) {
    return []
  }
  // Why: a folder already covered by an existing rule shouldn't be offered again.
  const ignored = new Set(await checkIgnoredPaths(worktreePath, existing, options).catch(() => []))
  return existing.filter((name) => !ignored.has(name))
}

/**
 * Append a folder pattern to the worktree's .gitignore (creating it if absent),
 * skipping the write if the exact line is already present. Returns true on write.
 *
 * `folderName` comes from the renderer, so it is restricted to the known-huge
 * allowlist (single path segment, no separators/newlines) before being written
 * — otherwise a crafted value could inject arbitrary lines into .gitignore.
 */
export async function appendFolderToGitignore(
  worktreePath: string,
  folderName: string
): Promise<boolean> {
  hugeFolderGitignoreAddition(folderName, '')
  const gitignorePath = path.join(worktreePath, '.gitignore')
  let existingContent = ''
  try {
    existingContent = await readFile(gitignorePath, 'utf-8')
  } catch {
    existingContent = ''
  }
  const addition = hugeFolderGitignoreAddition(folderName, existingContent)
  if (addition === null) {
    return false
  }
  await appendFile(gitignorePath, addition, 'utf-8')
  return true
}
