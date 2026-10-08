import { useNetworkProxyViewer, type ProxyCommitResult } from '@/runtime/network-proxy-viewer'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { normalizeProxyBypassRules, normalizeProxyUrl } from '../../../../shared/network-proxy'
import { cn } from '@/lib/utils'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { getAdvancedNetworkSearchEntries } from './advanced-network-search'
import { SearchableSetting } from './SearchableSetting'
import { matchesSettingsSearch, normalizeSettingsSearchQuery } from './settings-search'
import { translate } from '@/i18n/i18n'

/** Open the proxy fields automatically when a search matches this section. */
export function shouldOpenNetworkProxyConfig(searchQuery: string): boolean {
  return (
    normalizeSettingsSearchQuery(searchQuery) !== '' &&
    matchesSettingsSearch(searchQuery, getAdvancedNetworkSearchEntries())
  )
}

/** A configured proxy should also reveal the fields, so users see the value. */
export function hasConfiguredNetworkProxy(settings: GlobalSettings): boolean {
  return Boolean(settings.httpProxyUrl?.trim() || settings.httpProxyBypassRules?.trim())
}

export type HttpProxyUrlDraftState = {
  sourceValue: string
  draft: string
  error: string | null
}

export function createHttpProxyUrlDraftState(
  httpProxyUrl: string | undefined
): HttpProxyUrlDraftState {
  const sourceValue = httpProxyUrl ?? ''
  return {
    sourceValue,
    draft: sourceValue,
    error: null
  }
}

function resolveHttpProxyUrlDraftState(
  state: HttpProxyUrlDraftState,
  httpProxyUrl: string | undefined
): HttpProxyUrlDraftState {
  const sourceValue = httpProxyUrl ?? ''
  return state.sourceValue === sourceValue ? state : createHttpProxyUrlDraftState(httpProxyUrl)
}

export function updateHttpProxyUrlDraftState(
  state: HttpProxyUrlDraftState,
  httpProxyUrl: string | undefined,
  draft: string
): HttpProxyUrlDraftState {
  return {
    // Why: settings persistence is async, so edits after an external settings
    // reload must build on the latest persisted proxy source.
    ...resolveHttpProxyUrlDraftState(state, httpProxyUrl),
    draft,
    error: null
  }
}

export function setHttpProxyUrlDraftErrorState(
  state: HttpProxyUrlDraftState,
  httpProxyUrl: string | undefined,
  error: string
): HttpProxyUrlDraftState {
  return {
    ...resolveHttpProxyUrlDraftState(state, httpProxyUrl),
    error
  }
}

export type HttpProxyBypassRulesDraftState = {
  sourceValue: string
  draft: string
}

export function createHttpProxyBypassRulesDraftState(
  httpProxyBypassRules: string | undefined
): HttpProxyBypassRulesDraftState {
  const sourceValue = httpProxyBypassRules ?? ''
  return {
    sourceValue,
    draft: sourceValue
  }
}

function resolveHttpProxyBypassRulesDraftState(
  state: HttpProxyBypassRulesDraftState,
  httpProxyBypassRules: string | undefined
): HttpProxyBypassRulesDraftState {
  const sourceValue = httpProxyBypassRules ?? ''
  return state.sourceValue === sourceValue
    ? state
    : createHttpProxyBypassRulesDraftState(httpProxyBypassRules)
}

export function updateHttpProxyBypassRulesDraftState(
  state: HttpProxyBypassRulesDraftState,
  httpProxyBypassRules: string | undefined,
  draft: string
): HttpProxyBypassRulesDraftState {
  return {
    ...resolveHttpProxyBypassRulesDraftState(state, httpProxyBypassRules),
    draft
  }
}

type AdvancedNetworkSettingsSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function AdvancedNetworkSettingsSection({
  settings,
  updateSettings
}: AdvancedNetworkSettingsSectionProps): React.JSX.Element {
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const [proxyConfigOpen, setProxyConfigOpen] = useState(false)
  // Reveal the fields when searching for proxy terms or when a proxy is set,
  // so the value is never hidden behind a collapsed trigger.
  const proxyConfigForcedOpen =
    shouldOpenNetworkProxyConfig(searchQuery) || hasConfiguredNetworkProxy(settings)
  const proxyConfigExpanded = proxyConfigOpen || proxyConfigForcedOpen

  const [httpProxyUrlDraftState, setHttpProxyUrlDraftState] = useState(() =>
    createHttpProxyUrlDraftState(settings.httpProxyUrl)
  )
  const [httpProxyBypassRulesDraftState, setHttpProxyBypassRulesDraftState] = useState(() =>
    createHttpProxyBypassRulesDraftState(settings.httpProxyBypassRules)
  )

  const resolvedHttpProxyUrlDraftState = resolveHttpProxyUrlDraftState(
    httpProxyUrlDraftState,
    settings.httpProxyUrl
  )
  if (resolvedHttpProxyUrlDraftState !== httpProxyUrlDraftState) {
    // Why: Settings can change outside this pane; reconcile the proxy draft
    // before paint so stale network values do not briefly appear.
    setHttpProxyUrlDraftState(resolvedHttpProxyUrlDraftState)
  }
  const httpProxyUrlDraft = resolvedHttpProxyUrlDraftState.draft
  const httpProxyUrlError = resolvedHttpProxyUrlDraftState.error

  const resolvedHttpProxyBypassRulesDraftState = resolveHttpProxyBypassRulesDraftState(
    httpProxyBypassRulesDraftState,
    settings.httpProxyBypassRules
  )
  if (resolvedHttpProxyBypassRulesDraftState !== httpProxyBypassRulesDraftState) {
    // Why: Proxy bypass rules are local input state, but settings reloads can
    // replace their source while this pane is mounted.
    setHttpProxyBypassRulesDraftState(resolvedHttpProxyBypassRulesDraftState)
  }
  const httpProxyBypassRulesDraft = resolvedHttpProxyBypassRulesDraftState.draft

  const urlRevision = useRef(0)
  const bypassRevision = useRef(0)
  const latestEditedDraft = useRef({ url: httpProxyUrlDraft, bypass: httpProxyBypassRulesDraft })
  const saving = useRef({ url: false, bypass: false })
  const committedDrafts = useRef({ url: httpProxyUrlDraft, bypass: httpProxyBypassRulesDraft })
  useEffect(() => {
    committedDrafts.current = { url: httpProxyUrlDraft, bypass: httpProxyBypassRulesDraft }
  })

  const updateHttpProxyUrlDraft = (draft: string): void => {
    urlRevision.current += 1
    latestEditedDraft.current.url = draft
    setHttpProxyUrlDraftState((current) =>
      updateHttpProxyUrlDraftState(current, settings.httpProxyUrl, draft)
    )
  }

  const updateHttpProxyBypassRulesDraft = (draft: string): void => {
    bypassRevision.current += 1
    latestEditedDraft.current.bypass = draft
    setHttpProxyBypassRulesDraftState((current) =>
      updateHttpProxyBypassRulesDraftState(current, settings.httpProxyBypassRules, draft)
    )
  }

  const persistProxySetting = async (
    kind: 'url' | 'bypass',
    value: string
  ): Promise<ProxyCommitResult | null> => {
    if (saving.current[kind]) {
      return null
    }
    const key = kind === 'url' ? 'httpProxyUrl' : 'httpProxyBypassRules'
    const source = settings[key] ?? ''
    const currentSettings = useAppStore.getState().settings
    if (currentSettings && (currentSettings[key] ?? '') !== source) {
      return null
    }
    const revisionRef = kind === 'url' ? urlRevision : bypassRevision
    const revision = revisionRef.current
    saving.current[kind] = true
    try {
      if (value !== source) {
        await updateSettings({ [key]: value })
      }
      if (
        revision !== revisionRef.current &&
        (useAppStore.getState().settings?.[key] ?? '') === value
      ) {
        const draft = latestEditedDraft.current[kind]
        if (kind === 'url') {
          setHttpProxyUrlDraftState((state) => updateHttpProxyUrlDraftState(state, value, draft))
        } else {
          setHttpProxyBypassRulesDraftState((state) =>
            updateHttpProxyBypassRulesDraftState(state, value, draft)
          )
        }
      }
      const persisted = (await window.api.settings.get())[key] ?? ''
      const readCurrent = () => useAppStore.getState().settings?.[key] ?? source
      const current = () =>
        revision === revisionRef.current && (readCurrent() === source || readCurrent() === value)
      return {
        persisted: persisted === value,
        current,
        matches: () =>
          current() && readCurrent() === value && committedDrafts.current[kind] === value
      }
    } catch {
      return null
    } finally {
      saving.current[kind] = false
    }
  }
  const commitHttpProxyUrl = async (): Promise<ProxyCommitResult | null> => {
    const normalized = normalizeProxyUrl(httpProxyUrlDraft)
    if (!normalized.ok) {
      setHttpProxyUrlDraftState((current) =>
        setHttpProxyUrlDraftErrorState(current, settings.httpProxyUrl, normalized.message)
      )
      return null
    }
    setHttpProxyUrlDraftState((current) =>
      updateHttpProxyUrlDraftState(current, settings.httpProxyUrl, normalized.value)
    )
    return persistProxySetting('url', normalized.value)
  }
  const commitHttpProxyBypassRules = async (): Promise<ProxyCommitResult | null> => {
    const normalized = normalizeProxyBypassRules(httpProxyBypassRulesDraft)
    setHttpProxyBypassRulesDraftState((current) =>
      updateHttpProxyBypassRulesDraftState(current, settings.httpProxyBypassRules, normalized)
    )
    return persistProxySetting('bypass', normalized)
  }

  useNetworkProxyViewer({
    read: () => ({
      open: proxyConfigExpanded,
      forcedOpen: proxyConfigForcedOpen,
      urlDraftSet: Boolean(httpProxyUrlDraft),
      bypassDraftSet: Boolean(httpProxyBypassRulesDraft),
      urlInvalid: httpProxyUrlError !== null
    }),
    disclosure: setProxyConfigOpen,
    commit: (kind) => (kind === 'url' ? commitHttpProxyUrl() : commitHttpProxyBypassRules()),
    url: updateHttpProxyUrlDraft,
    bypass: updateHttpProxyBypassRulesDraft,
    matches: (kind, value) =>
      (kind === 'url' ? httpProxyUrlDraft : httpProxyBypassRulesDraft) === value
  })

  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.AdvancedNetworkSettingsSection.c46cdbbd4e',
        'Network'
      )}
      description={translate(
        'auto.components.settings.AdvancedNetworkSettingsSection.823e0f15b1',
        'Proxy URL for Orca network requests and local terminal children.'
      )}
      keywords={[
        'proxy',
        'http_proxy',
        'https_proxy',
        'no_proxy',
        'network',
        'bypass',
        'localhost'
      ]}
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <Label>
            {translate(
              'auto.components.settings.AdvancedNetworkSettingsSection.f00daf6324',
              'HTTP Proxy'
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.AdvancedNetworkSettingsSection.1e214e265a',
              'Leave empty to use system proxy settings and inherited proxy environment variables.'
            )}
          </p>
        </div>
      </div>

      <Collapsible open={proxyConfigExpanded} onOpenChange={setProxyConfigOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {translate(
              'auto.components.settings.AdvancedNetworkSettingsSection.configureProxy',
              'Configure proxy'
            )}
            <ChevronDown
              className={cn('size-3.5 transition-transform', proxyConfigExpanded && 'rotate-180')}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-4 rounded-md border border-border/60 bg-muted/20 px-3 py-3">
            <div className="space-y-2">
              <Label htmlFor="settings-http-proxy-url">
                {translate(
                  'auto.components.settings.AdvancedNetworkSettingsSection.f00daf6324',
                  'HTTP Proxy'
                )}
              </Label>
              <Input
                id="settings-http-proxy-url"
                value={httpProxyUrlDraft}
                onChange={(e) => {
                  updateHttpProxyUrlDraft(e.target.value)
                }}
                onBlur={commitHttpProxyUrl}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  }
                }}
                placeholder={translate(
                  'auto.components.settings.AdvancedNetworkSettingsSection.476f302aca',
                  'http://proxy.example.com:8080'
                )}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={httpProxyUrlError ? true : undefined}
                className="font-mono text-xs"
              />
              {httpProxyUrlError ? (
                <p className="text-xs text-destructive">{httpProxyUrlError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.AdvancedNetworkSettingsSection.0adfce9fa7',
                    'Supports http, https, socks, socks4, and socks5 URLs.'
                  )}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-http-proxy-bypass-rules">
                {translate(
                  'auto.components.settings.AdvancedNetworkSettingsSection.f6d76cc8f4',
                  'Proxy Bypass Rules'
                )}
              </Label>
              <Textarea
                id="settings-http-proxy-bypass-rules"
                value={httpProxyBypassRulesDraft}
                onChange={(e) => updateHttpProxyBypassRulesDraft(e.target.value)}
                onBlur={commitHttpProxyBypassRules}
                placeholder={translate(
                  'auto.components.settings.AdvancedNetworkSettingsSection.3e431564b5',
                  'localhost, 127.0.0.1, *.internal'
                )}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.AdvancedNetworkSettingsSection.33ee3ca3af',
                  'Optional. Separate hosts with commas, semicolons, or new lines.'
                )}
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </SearchableSetting>
  )
}
