import React from 'react'
import { useAutomationProjectCombobox } from './use-automation-project-combobox'
import { Check, ChevronRight, ChevronsUpDown, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandInput, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import RepoBadgeLabel from '@/components/repo/RepoBadgeLabel'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { Repo } from '../../../../shared/repo-types'
import {
  hasMultipleHostsInGroup,
  getAutomationProjectSelectedSource
} from './automation-project-groups'

export type AutomationProjectComboboxProps = {
  repos: readonly Repo[]
  value: string
  onValueChange: (repoId: string) => void
  placeholder?: string
  triggerClassName?: string
  getRepoHostLabel?: (repo: Repo) => string | null | undefined
  allowAddProject?: boolean
}

function getRepoDetail(repo: Repo, hostLabel?: string | null): string {
  const label = hostLabel?.trim()
  return label ? `${label} · ${repo.path}` : repo.path
}

export default function AutomationProjectCombobox({
  repos,
  value,
  onValueChange,
  placeholder = 'Select project',
  triggerClassName,
  getRepoHostLabel,
  allowAddProject = true
}: AutomationProjectComboboxProps): React.JSX.Element {
  const {
    open,
    query,
    commandValue,
    hostMenuProjectKey,
    isAdding,
    selectedRepo,
    showHostLabels,
    filteredGroups,
    handleOpenChange,
    handleSelect,
    handleAddFolder,
    focusSearchInput,
    setInputNode,
    setQuery,
    setCommandValue,
    setHostMenuHover,
    setHostMenuProjectKey
  } = useAutomationProjectCombobox({ repos, value, onValueChange, allowAddProject })
  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'h-8 min-w-[184px] justify-between px-3 text-xs font-normal',
            triggerClassName
          )}
        >
          {selectedRepo ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <RepoBadgeLabel
                name={selectedRepo.displayName}
                color={selectedRepo.badgeColor}
                badgeClassName="size-1.5"
              />
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          focusSearchInput()
        }}
      >
        <Command shouldFilter={false} value={commandValue} onValueChange={setCommandValue}>
          <CommandInput
            ref={setInputNode}
            placeholder={translate(
              'auto.components.automations.AutomationProjectCombobox.search',
              'Search projects/folders...'
            )}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {translate(
                  'auto.components.automations.AutomationProjectCombobox.empty',
                  'No projects/folders match your search.'
                )}
              </div>
            ) : null}
            {filteredGroups.map((group) => {
              const selectedSource = getAutomationProjectSelectedSource(group, value)
              const selectedProject = group.sources.some((source) => source.id === value)
              const hasHostMenu = hasMultipleHostsInGroup(group.sources)
              const hostLabel = showHostLabels ? getRepoHostLabel?.(selectedSource) : null
              const detail = hasHostMenu
                ? `${hostLabel?.trim() || getRepoExecutionHostId(selectedSource)} · ${group.sources.length} hosts`
                : getRepoDetail(selectedSource, hostLabel)
              return (
                <div
                  key={group.projectKey}
                  onMouseEnter={() => {
                    setCommandValue(group.repo.id)
                    if (hasHostMenu) {
                      void setHostMenuHover(group.projectKey, 'row', true)
                    }
                  }}
                  onMouseLeave={() => {
                    if (hasHostMenu) {
                      void setHostMenuHover(group.projectKey, 'row', false)
                    }
                  }}
                  className={cn(
                    'group/automation-project-row flex items-stretch transition-colors hover:bg-accent hover:text-accent-foreground',
                    commandValue === group.repo.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(selectedSource.id)}
                    onMouseDown={(event) => event.preventDefault()}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs"
                  >
                    <Check
                      className={cn(
                        'size-3 text-foreground',
                        selectedProject ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <RepoBadgeLabel
                        name={group.repo.displayName}
                        color={group.repo.badgeColor}
                        className="max-w-full"
                      />
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</p>
                    </div>
                  </button>
                  {hasHostMenu ? (
                    <Popover
                      open={hostMenuProjectKey === group.projectKey}
                      onOpenChange={(nextOpen) =>
                        setHostMenuProjectKey(nextOpen ? group.projectKey : null)
                      }
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          title={translate(
                            'auto.components.automations.AutomationProjectCombobox.chooseHost',
                            'Choose automation host'
                          )}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          className="flex w-7 shrink-0 items-center justify-center text-muted-foreground"
                        >
                          <ChevronRight className="size-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="right"
                        align="start"
                        sideOffset={6}
                        className="w-[min(260px,calc(100vw-1rem))] p-1"
                        onMouseEnter={() =>
                          void setHostMenuHover(group.projectKey, 'content', true)
                        }
                        onMouseLeave={() =>
                          void setHostMenuHover(group.projectKey, 'content', false)
                        }
                      >
                        <div className="py-1">
                          {group.sources.map((source) => {
                            const sourceHostLabel = showHostLabels
                              ? getRepoHostLabel?.(source)
                              : null
                            const sourceSelected = source.id === selectedSource.id
                            return (
                              <button
                                key={source.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => handleSelect(source.id)}
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                              >
                                <Check
                                  className={cn(
                                    'size-3 text-muted-foreground',
                                    sourceSelected ? 'opacity-70' : 'opacity-0'
                                  )}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs">
                                    {sourceHostLabel ?? getRepoExecutionHostId(source)}
                                  </div>
                                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                    {source.path}
                                  </p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
              )
            })}
          </CommandList>
          {allowAddProject ? (
            <div className="border-t border-border">
              <Button
                type="button"
                variant="ghost"
                disabled={isAdding}
                onClick={() => void handleAddFolder()}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setCommandValue('')}
                className="h-8 w-full justify-start rounded-none px-3 text-xs font-normal"
              >
                <FolderPlus className="size-3.5 text-muted-foreground" />
                <span>
                  {isAdding
                    ? translate(
                        'auto.components.automations.AutomationProjectCombobox.adding',
                        'Adding project…'
                      )
                    : translate(
                        'auto.components.automations.AutomationProjectCombobox.addProject',
                        'Add project'
                      )}
                </span>
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
