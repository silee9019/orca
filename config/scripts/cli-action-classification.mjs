const slug = (value) => value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-|-$/g, '')

export const ACTION_DOMAINS = [
  {
    id: 'connections',
    phase: 3,
    pattern: /ssh|runtimeenviron|pairing|mobile|network|firewall|remote-workspace/,
    owner: 'runtime environment / SSH / pairing services',
    host: 'selected execution host; viewer owns environment selection'
  },
  {
    id: 'accounts-permissions',
    phase: 4,
    pattern:
      /account|credential|usage|ratelimit|permission|tcc|oauth|sign.?in|login|cookie|proxy|agentdefaultenv/,
    owner: 'provider account / credential / usage / OS permission services',
    host: 'selected provider execution host and OS permission authority'
  },
  {
    id: 'extensions',
    phase: 8,
    pattern: /plugin|skill|automation|artifact|profile|preset/,
    owner: 'PluginService / skill / automation / artifact / profile services',
    host: 'contribution owner runtime; preserve consent and capability checks'
  },
  {
    id: 'tools',
    phase: 7,
    pattern: /browser|emulator|computer|speech|voice|ephemeralvm|virtual.machine|\bvm\b/,
    owner: 'browser placement / device / computer / speech / VM services',
    host: 'explicit execution host or browser placement owner'
  },
  {
    id: 'agent-sessions',
    phase: 6,
    pattern:
      /native.chat|nativechat|agent.session|agentsession|agent.status|agentstatus|agentawake|pty|terminal|composer|session|orchestration|hooks/,
    owner: 'execution-host hook status / PTY / agent session services',
    host: 'execution host owns process and canonical agent status'
  },
  {
    id: 'workspace-data',
    phase: 5,
    pattern:
      /hostedreview|bitbucket|github|gitlab|\bgh\b|\bgl\b|jira|linear|task|review|pull.request|pullrequest|source.control|sourcecontrol|git|repo|project|worktree|workspace.cleanup|workspacecleanup|workspaceports|workspacespace|folderworkspace|file|editor|notebook|docpreview|sparse/,
    owner: 'workspace / filesystem / Git / review / task services; editor buffer belongs to viewer',
    host: 'selected native / SSH / peer host; folder workspaces need no Git'
  },
  {
    id: 'settings',
    phase: 1,
    pattern: /setting|keybinding|preflight|codexconfigsync/,
    owner: 'settings normalizer / persistence / runtime-client-settings services',
    host: 'selected settings runtime; local-only fields remain local'
  },
  {
    id: 'app-lifecycle',
    phase: 9,
    pattern:
      /updat|lifecycle|crash|feedback|notification|onboarding|telemetry|star.?nag|aivault|memory|stats|pet|diagnostic|cache|export|\bapp\b|platform|\bcli\b|pwsh|gitbash|wsl|\bshell\b/,
    owner: 'app/runtime lifecycle / updater / support services',
    host: 'explicit app or server runtime; OS and consent boundaries remain intact'
  },
  {
    id: 'viewer-ui',
    phase: 2,
    pattern: /./,
    owner: 'renderer component/store action and runtime viewer notifier',
    host: 'explicit viewer and its active runtime; preserve durable shared UI projection'
  }
]

export const CLASSIFICATION_RULES = {
  api: 'Contract member ID identifies the operation; onX subscriptions remain internal to the same surface effect.',
  command:
    'The declared CLI path identifies the public operation; execution evidence remains separate.',
  control:
    'Owning component and named callback/call target identify the operation; native event plumbing is internal.',
  'control-spread':
    'Owning component forwards props to its surface action; forwarding is internal, never a supported command.',
  event: 'Exact ui event identifies notification/dispatch plumbing linked to its surface effect.',
  menu: 'Explicit action/native role or callback target identifies the menu operation.',
  pane: 'Declared pane ID identifies settings navigation, including dynamic pane templates.',
  search: 'Owning search component and explicit target/title identify query-result navigation.',
  setting:
    'Persisted key identifies setting behavior; migration and private markers stay internal.',
  shortcut:
    'Declared action ID identifies the shortcut effect; key chord is an alias, not a new operation.',
  registration:
    'Named contribution schema identifies the dynamic command/panel registration boundary.'
}

function describeSource(source) {
  const kind = source.id.split(':')[0]
  if (!CLASSIFICATION_RULES[kind]) {
    throw new Error(`Unknown source kind: ${kind}`)
  }
  const detail = source.detail
  const identity = source.id.slice(kind.length + 1)
  const component = slug(source.component ?? source.file.replace(/\.[^.]+$/, ''))
  const attribute = detail.match(/\b(on[A-Z]\w*)\s*=/)?.[1]
  const callback = detail.match(/=\{([\w.]+)\}/)?.[1]
  const calls = (source.callOperations ?? source.calls ?? []).filter(
    (call) =>
      !/^(?:translate|Boolean|String|Number|event\.(?:preventDefault|stopPropagation))$/.test(
        call
      ) && !/^is[A-Z]/.test(call)
  )
  let operation = callback ?? calls[0] ?? attribute ?? kind
  let internal = kind === 'control-spread' || kind === 'event'
  if (kind === 'api') {
    operation = identity
    internal = /\.on[A-Z]|\.(?:setPtyDeliveryInterest|serializeBufferResponse)$/.test(identity)
  } else if (kind === 'command' || kind === 'setting' || kind === 'registration') {
    operation = identity
    internal =
      kind === 'registration' ||
      (kind === 'setting' && /^_|migration|migrated|defaulted/i.test(identity))
  } else if (kind === 'shortcut' || kind === 'pane') {
    operation = detail.match(/\bid:\s*(['"`])(.+?)\1/)?.[2] ?? identity
  } else if (kind === 'menu') {
    operation =
      detail.match(/\b(?:action|role):\s*['"]([^'"]+)/)?.[1] ?? source.menuOperation ?? operation
    if (source.file.endsWith('/app-menu-selection-item.ts')) {
      operation = 'selection'
    }
  } else if (kind === 'search') {
    operation =
      source.declaredId ||
      source.titleKey ||
      (detail.match(/\btargetSectionId:\s*['"]([^'"]+)/)?.[1] ??
        detail.match(/\btitle:\s*['"]([^'"]+)/)?.[1] ??
        operation)
  } else if (kind === 'event') {
    operation = detail
  } else if (kind === 'control-spread') {
    operation = detail.replace(/\s+/g, ' ')
  }
  if (kind === 'control' && !calls.length && /preventDefault|stopPropagation/.test(detail)) {
    internal = true
  }
  if (kind === 'control' && /^set(?:Is)?(?:Hovered|Focused|PointerInside)$/.test(operation)) {
    internal = true
  }
  const domainText = `${operation} ${source.file} ${source.component ?? ''}`.toLowerCase()
  let domain = ACTION_DOMAINS.find((item) => item.pattern.test(domainText))
  if (
    kind === 'command' &&
    /^src\/cli\/specs\/workspace-(?:folder|ports|repo-data|cached-scans|cleanup-dismissals|git-startup|crash-reports|host-path|visible-worktrees|desktop-meta|repo-username|repo-update|import-previews|shell-actions|notebook-environments|diagnostic-preview|repo-icon-picker|cleanup-scan|worktree-forget|repo-folder-picker|repo-add|repo-create-remote|github-refresh|localhost-label|space-scan|lineage|file-list|nested-scan|file-search|remote-clone|local-clone|notebook-kernel|log-tail|git-status|download-session|remote-folder-download|remote-file-download)\.ts$/.test(
      source.file
    )
  ) {
    domain = ACTION_DOMAINS.find((item) => item.id === 'workspace-data')
  }
  if (/browser/.test(source.file.toLowerCase()) && kind !== 'setting') {
    domain = ACTION_DOMAINS.find((item) => item.id === 'tools')
  }
  if (
    /github|gitlab|pull-request|source-control|new-workspace/.test(source.file.toLowerCase()) &&
    kind !== 'setting'
  ) {
    domain = ACTION_DOMAINS.find((item) => item.id === 'workspace-data')
  }
  if (kind === 'menu') {
    domain = ACTION_DOMAINS.find(
      (item) =>
        item.id ===
        (/quit|reload|update|restart|relaunch|about|services|hide|unhide/i.test(operation)
          ? 'app-lifecycle'
          : 'viewer-ui')
    )
  }
  if (kind === 'event') {
    domain = ACTION_DOMAINS.find(
      (item) =>
        item.id ===
        (/browser|dictation/i.test(operation)
          ? 'tools'
          : /terminal/i.test(operation)
            ? 'agent-sessions'
            : 'viewer-ui')
    )
  }
  if (
    kind === 'setting' &&
    !/cookie|credential|token|secret|proxy|agentdefaultenv/i.test(operation)
  ) {
    domain = ACTION_DOMAINS.find((item) => item.id === 'settings')
  }
  if (/^api:(?:gitBash|pwsh|wsl)\./.test(source.id)) {
    domain = ACTION_DOMAINS.find((item) => item.id === 'app-lifecycle')
  }
  if (
    ['pane', 'search'].includes(kind) ||
    (kind === 'shortcut' &&
      !/terminal|browser|git|agent|task|editor|workspace\.create/i.test(operation)) ||
    (kind === 'menu' &&
      /^(?:undo|redo|cut|copy|paste|selectAll|resetZoom|zoomIn|zoomOut|togglefullscreen|minimize|close|window)$/.test(
        operation
      )) ||
    /^(?:api:ui\.|command:ui )/.test(source.id) ||
    (kind === 'control' &&
      /filter|sidebar|tab-bar|palette|window/.test(source.file.toLowerCase()) &&
      /set|toggle|clear|query|highlight|openchange/i.test(operation))
  ) {
    domain = ACTION_DOMAINS.find((item) => item.id === 'viewer-ui')
  }
  const surface =
    kind === 'api' && internal
      ? `surface.${domain.id}.${slug(identity.split('.')[0])}.observe`
      : kind === 'event'
        ? `surface.${domain.id}.${slug(operation)}.effect`
        : `surface.${domain.id}.${slug(source.file.replace(/\.[^.]+$/, ''))}.${component}`
  const id = ['api', 'command', 'setting', 'shortcut', 'registration', 'event'].includes(kind)
    ? `${kind}.${slug(operation)}`
    : `${surface}.${kind}.${slug(operation)}`
  return { id, kind, internal, domain, surface, operation }
}

export function classifyActionSources(sources, ledger) {
  const actions = structuredClone(ledger.actions)
  const mapped = new Set(actions.flatMap((action) => action.sources.map((source) => source.id)))
  const byId = new Map(actions.map((action) => [action.id, action]))
  const bundles = new Map(ledger.bundles.map((bundle) => [bundle.id, bundle]))
  for (const domain of ACTION_DOMAINS) {
    bundles.set(domain.id, {
      id: domain.id,
      phase: domain.phase,
      dependsOn: domain.phase === 1 ? [] : ['settings'],
      conflictFiles: ['src/cli/specs/index.ts', 'src/cli/handler-group-manifest.ts']
    })
  }
  const ruleCounts = {}
  const pending = sources
    .filter((source) => !mapped.has(source.id))
    .map((source) => ({ source, ...describeSource(source) }))
  const add = (entry, id, internal, parent, derived = false) => {
    const { source, domain, kind, operation } = entry
    let action = byId.get(id)
    if (!action) {
      action = {
        id,
        phase: domain.phase,
        bundle: domain.id,
        effect: `${source.component ?? source.file}: ${operation}에 연결된 사용자 효과를 CLI에서 같은 대상으로 수행합니다.`,
        owner: `${domain.owner}; source boundary ${source.file}:${source.component ?? kind}`,
        host: domain.host,
        viewer:
          'UI effects target an explicit viewer; headless and unavailable viewers return explicit errors',
        gap: 'Rule-classified behavior; CLI equivalence and actual effect are not yet verified',
        verification:
          'Compare existing service and CLI effects, target host/viewer, persisted/applied acknowledgements, native/SSH/peer/folder, OS/flags, permissions, secrets and mixed versions; internal plumbing must preserve its parent effect',
        support: internal ? 'internal' : 'gap',
        evidence: 'unverified',
        sources: [],
        rule: kind,
        rationale: CLASSIFICATION_RULES[kind]
      }
      if (kind === 'command') {
        action.command = source.id.slice(8)
      }
      if (internal) {
        action.parent = parent
      }
      byId.set(id, action)
      actions.push(action)
    }
    if (action.bundle !== domain.id) {
      throw new Error(`Conflicting action owner: ${id}`)
    }
    if (derived) {
      action.derivedFrom = [source.id]
    } else {
      action.sources.push({ id: source.id, fingerprint: source.fingerprint })
      ruleCounts[kind] = (ruleCounts[kind] ?? 0) + 1
    }
  }
  // Internal forwarding has a surface effect to verify, never an implied CLI implementation.
  const surfaceParents = new Map()
  for (const entry of pending) {
    if (!entry.internal) {
      add(entry, entry.id, false)
      surfaceParents.set(entry.surface, entry.id)
    }
  }
  for (const entry of pending.filter((item) => item.internal)) {
    let parent = surfaceParents.get(entry.surface)
    if (!parent) {
      parent = `${entry.surface}.effect`
      add(entry, parent, false, undefined, true)
      surfaceParents.set(entry.surface, parent)
    }
    add(entry, entry.id, true, parent)
  }
  return { ...ledger, actions, bundles: [...bundles.values()], ruleCounts }
}
