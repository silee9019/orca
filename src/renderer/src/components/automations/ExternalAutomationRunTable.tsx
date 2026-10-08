import React from 'react'
import { useExternalAutomationRunTable } from './use-external-automation-run-table'
import { AlertCircle, ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type {
  ExternalAutomationJob,
  ExternalAutomationManager,
  ExternalAutomationRun
} from '../../../../shared/automations-types'
import type { ExternalAutomationScope } from './external-automation-scope-client'
import {
  formatExternalDate,
  getExternalRunStatusLabel,
  getExternalRunStatusVariant
} from './external-automation-display'
import { translate } from '@/i18n/i18n'

export type ExternalAutomationRunPage = {
  runs: ExternalAutomationRun[]
  totalCount?: number
}

export type FetchExternalAutomationRuns = (input: {
  /** The host the rows are read from; a manager ID alone cannot name one. */
  scope: ExternalAutomationScope
  manager: ExternalAutomationManager
  job: ExternalAutomationJob
  page: number
  pageSize: number
}) => Promise<ExternalAutomationRun[] | ExternalAutomationRunPage>

export type ExternalAutomationRunTableProps = {
  scope: ExternalAutomationScope
  manager: ExternalAutomationManager
  job: ExternalAutomationJob
  now: number
  onFetchRuns?: FetchExternalAutomationRuns
  onOpenRun?: (run: ExternalAutomationRun) => void
}

function getRunSummary(run: ExternalAutomationRun): string {
  return run.error ?? run.outputPreview ?? 'No output preview'
}

export function ExternalAutomationRunTable({
  scope,
  manager,
  job,
  now,
  onFetchRuns,
  onOpenRun
}: ExternalAutomationRunTableProps): React.JSX.Element {
  const {
    visibleRuns,
    totalCount,
    totalPages,
    selectedRun,
    hasVisibleRuns,
    pageStart,
    pageEnd,
    page,
    isLoading,
    fetchError,
    handlePageChange,
    handleRunSelect
  } = useExternalAutomationRunTable({ scope, manager, job, now, onFetchRuns, onOpenRun })

  return (
    <div className="mt-2 rounded-md border border-border/50 bg-background/50">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="text-xs font-medium">
            {translate('auto.components.automations.ExternalAutomationRunTable.2d4388a908', 'Runs')}
          </div>
          {isLoading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          {fetchError ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="size-3.5 text-destructive" />
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {fetchError}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {totalCount}{' '}
          {totalCount === 1
            ? translate('auto.components.automations.ExternalAutomationRunTable.872d032d05', 'run')
            : translate(
                'auto.components.automations.ExternalAutomationRunTable.d5527d8fe7',
                'runs'
              )}
        </div>
      </div>

      {hasVisibleRuns ? (
        <div>
          <div className="min-w-0 border-b border-border/50">
            <div className="grid grid-cols-[minmax(7.5rem,.45fr)_minmax(0,1fr)_auto] gap-3 border-b border-border/50 px-3 py-1.5 text-[11px] font-medium uppercase text-muted-foreground">
              <span>
                {translate(
                  'auto.components.automations.ExternalAutomationRunTable.d4b34feb66',
                  'Run time'
                )}
              </span>
              <span>
                {translate(
                  'auto.components.automations.ExternalAutomationRunTable.a813df9808',
                  'Preview'
                )}
              </span>
              <span>
                {translate(
                  'auto.components.automations.ExternalAutomationRunTable.be551397ca',
                  'Status'
                )}
              </span>
            </div>
            <div className="divide-y divide-border/50">
              {visibleRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  data-current={selectedRun?.id === run.id}
                  disabled={isLoading}
                  onClick={() => handleRunSelect(run)}
                  className={cn(
                    'grid w-full grid-cols-[minmax(7.5rem,.45fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    selectedRun?.id === run.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs">
                      {formatExternalDate(run.runAt, now)}
                    </span>
                    {run.outputPath ? (
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                        {run.outputPath}
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {getRunSummary(run)}
                  </span>
                  <Badge variant={getExternalRunStatusVariant(run)}>
                    {getExternalRunStatusLabel(run)}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-3 py-4 text-sm text-muted-foreground">
          {isLoading
            ? translate(
                'auto.components.automations.ExternalAutomationRunTable.8ea934cacf',
                'Loading runs...'
              )
            : translate(
                'auto.components.automations.ExternalAutomationRunTable.9c080765ff',
                'No Hermes runs found yet.'
              )}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          <span>
            {pageStart}-{pageEnd}{' '}
            {translate('auto.components.automations.ExternalAutomationRunTable.7475c0ce96', 'of')}{' '}
            {totalCount}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate(
              'auto.components.automations.ExternalAutomationRunTable.52d468a0b8',
              'Previous run page'
            )}
            disabled={page === 0 || isLoading}
            onClick={() => handlePageChange(Math.max(0, page - 1))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <div className="min-w-14 text-center text-xs text-muted-foreground">
            {page + 1} / {totalPages}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate(
              'auto.components.automations.ExternalAutomationRunTable.0ba9c0a95c',
              'Next run page'
            )}
            disabled={page >= totalPages - 1 || isLoading}
            onClick={() => handlePageChange(Math.min(totalPages - 1, page + 1))}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
