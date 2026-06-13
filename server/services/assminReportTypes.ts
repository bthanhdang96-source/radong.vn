export type ReportSeverity = 'ok' | 'warning' | 'critical' | 'unknown'
export type ReportFreshnessLabel = 'fresh' | 'aging' | 'stale' | 'unknown'

export interface ReportWarning {
  code: string
  severity: Exclude<ReportSeverity, 'ok'>
  message: string
}

export interface ReportSourceRow {
  key: string
  label: string
  group: 'news' | 'vn_prices' | 'weather' | 'export_registry'
  kind: 'feed' | 'crawler' | 'provider'
  status: ReportSeverity
  freshnessLabel: ReportFreshnessLabel
  lastUpdated: string | null
  checkedAt: string | null
  sourceUrl: string | null
  details: string[]
  warnings: ReportWarning[]
}

export interface ReportJobRow {
  key: string
  label: string
  group: 'scheduler' | 'dataset'
  status: ReportSeverity
  enabled: boolean
  cron: string | null
  lastUpdated: string | null
  details: string[]
  warnings: ReportWarning[]
}

export interface ReportSummary {
  ok: number
  warning: number
  critical: number
  unknown: number
  sources: number
  jobs: number
  warnings: number
}

export interface AssminPublicReportResponse {
  generatedAt: string
  overallStatus: ReportSeverity
  summary: ReportSummary
}

export interface AssminReportResponse extends AssminPublicReportResponse {
  runtime: {
    hasSupabaseReadConfig: boolean
    hasSupabaseAdminConfig: boolean
    missingServiceRole: boolean
  }
  sources: ReportSourceRow[]
  jobs: ReportJobRow[]
  warnings: ReportWarning[]
}
