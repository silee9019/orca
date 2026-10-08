import type { BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import type { Store } from './persistence'
import type { Repo } from '../shared/repo-types'
import { isFolderRepo } from '../shared/repo-kind'
import { getGitCloneFailureMessage } from '../shared/git-clone-failure-message'
import { gitSpawnAfterWindowsEnvironmentReady, promptGuardGitEnv } from './git/runner'
import {
  cleanupClaimedCloneTarget,
  claimCloneTarget,
  deriveValidatedClonePath,
  getClonePathComparisonKey
} from './git/repo-clone-path'
import { emitRepoAdded } from './ipc/repos/repo-added-telemetry'
import { runWithClonePathLock } from './ipc/repos/clone-path-lock'
import { emitLocalCloneProgress } from './desktop-local-clone-progress'
import { registerLocalCloneResult } from './desktop-local-clone-registration'
import {
  type ActiveCloneMetadata,
  waitForLocalCloneAbortCleanup,
  trackPendingRendererClone,
  releasePendingRendererClone,
  trackLocalClone,
  requestLocalCloneAbort,
  finishLocalClone,
  settleCloneAbortCleanup
} from './desktop-local-clone-lifecycle'
import type { DesktopRepositoryCloneControl } from './desktop-repository-clone-control'
export async function cloneLocalRepo(
  store: Store,
  mainWindow: BrowserWindow,
  args: { url: string; destination: string },
  controls?: DesktopRepositoryCloneControl
): Promise<Repo> {
  controls?.validateHost()
  // Why: derive the repo folder name from the URL's last segment, matching default git clone behavior.
  const clonePath = deriveValidatedClonePath(args)
  const clonePathKey = getClonePathComparisonKey(clonePath)
  return runWithClonePathLock(clonePathKey, async () => {
    await waitForLocalCloneAbortCleanup(clonePathKey)
    controls?.validateHost()
    const existingAfterPendingClone = store
      .getRepos()
      .find((r) => getClonePathComparisonKey(r.path) === clonePathKey)
    if (existingAfterPendingClone && !isFolderRepo(existingAfterPendingClone)) {
      // Why: clone_url always produces a git repo.
      emitRepoAdded('clone_url', true, true)
      return existingAfterPendingClone
    }
    // Why: gitSpawn cwd is args.destination, so it must exist before spawn (fresh installs may lack the defaulted parent).
    await mkdir(args.destination, { recursive: true })
    const claimedTarget = await claimCloneTarget(clonePath)

    // Why: spawn (not execFile) avoids the maxBuffer limit — clone progress on stderr can exceed Node's 1 MB default.
    // Why: --progress forces git to emit progress even when stderr isn't a TTY.
    const cloneMetadataRef: { current: ActiveCloneMetadata | null } = { current: null }
    let proc: Awaited<ReturnType<typeof gitSpawnAfterWindowsEnvironmentReady>>
    const pendingController = controls?.controller ?? new AbortController()
    if (!controls) {
      trackPendingRendererClone(pendingController)
    }
    try {
      controls?.validateHost()
      // Why: use the parent destination as cwd so the runner detects a WSL path and routes through wsl.exe.
      // Why: '--' isolates the URL so a malicious URL can't be read as git flags (command injection).
      proc = await gitSpawnAfterWindowsEnvironmentReady(
        ['clone', '--progress', '--', args.url, clonePath],
        {
          cwd: args.destination,
          admissionTier: 'interactive',
          // Why: without this, an auth-needing clone pops Git Credential Manager's OAuth window on Windows, unclosable in a restricted env (issue #7652).
          env: promptGuardGitEnv(),
          signal: pendingController.signal,
          stdio: ['ignore', 'ignore', 'pipe']
        }
      )
    } catch (err) {
      await cleanupClaimedCloneTarget(clonePath, claimedTarget)
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Clone failed: ${message}`)
    } finally {
      if (!controls) {
        releasePendingRendererClone(pendingController)
      }
    }
    await new Promise<void>((resolve, reject) => {
      const metadata = trackLocalClone(clonePath, clonePathKey, claimedTarget, proc, !controls)
      cloneMetadataRef.current = metadata
      const abort = () => requestLocalCloneAbort(metadata)
      controls?.controller.signal.addEventListener('abort', abort, { once: true })

      let stderrTail = ''
      let settled = false
      proc.stderr!.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderrTail = (stderrTail + text).slice(-4096)

        // Why: git progress lines use \r to overwrite in-place; parse fragments the same as SSH clone.
        emitLocalCloneProgress(mainWindow, text, controls)
      })

      const finishClone = async (
        code: number | null,
        signal: NodeJS.Signals | null,
        err?: Error
      ) => {
        if (settled) {
          return
        }
        settled = true
        controls?.controller.signal.removeEventListener('abort', abort)
        const cloneSucceeded = !err && code === 0 && !signal
        await finishLocalClone(metadata, cloneSucceeded)

        if (err) {
          reject(new Error(`Clone failed: ${err.message}`))
        } else if (signal === 'SIGTERM') {
          reject(new Error('Clone aborted'))
        } else if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Clone failed: ${getGitCloneFailureMessage(stderrTail, { clonePath })}`))
        }
      }

      proc.on('error', (err) => {
        void finishClone(null, null, err)
      })

      proc.on('close', (code, signal) => {
        void finishClone(code, signal)
      })
      if (controls?.controller.signal.aborted) {
        abort()
      }
    })

    try {
      controls?.validateHost()
      return await registerLocalCloneResult(store, mainWindow, clonePath, clonePathKey, controls)
    } finally {
      const metadata = cloneMetadataRef.current
      if (metadata?.abortRequested) {
        settleCloneAbortCleanup(metadata)
      }
    }
  })
}
