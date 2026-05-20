import { useEffect, useMemo, useState } from 'react'
import type { AssminReportResponse, ReportJobRow, ReportSeverity, ReportSourceRow } from '../data/assminReportTypes'
import { buildApiUrl } from '../lib/api'
import './AssminReportPage.css'

const EMPTY_REPORT: AssminReportResponse = {
  success: true,
  generatedAt: '',
  overallStatus: 'unknown',
  runtime: {
    hasSupabaseReadConfig: false,
    hasSupabaseAdminConfig: false,
    missingServiceRole: false,
  },
  sources: [],
  jobs: [],
  warnings: [],
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString('vi-VN') : '--'
}

function severityLabel(value: ReportSeverity) {
  switch (value) {
    case 'ok':
      return 'OK'
    case 'warning':
      return 'Cảnh báo'
    case 'critical':
      return 'Nghiêm trọng'
    case 'unknown':
    default:
      return 'Chưa rõ'
  }
}

function groupLabel(value: ReportSourceRow['group'] | ReportJobRow['group']) {
  switch (value) {
    case 'news':
      return 'Nguồn news'
    case 'vn_prices':
      return 'Nguồn giá Việt Nam'
    case 'weather':
      return 'Weather providers'
    case 'export_registry':
      return 'Tra cứu xuất khẩu'
    case 'scheduler':
      return 'Scheduler / runtime'
    case 'dataset':
      return 'Dataset jobs'
    default:
      return value
  }
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="assmin__section-head">
      <div>
        <span className="assmin__eyebrow">{title}</span>
        {meta ? <p>{meta}</p> : null}
      </div>
    </div>
  )
}

function StatusBadge({ value }: { value: ReportSeverity }) {
  return <span className={`assmin__badge assmin__badge--${value}`}>{severityLabel(value)}</span>
}

function FreshnessBadge({ value }: { value: ReportSourceRow['freshnessLabel'] }) {
  return <span className={`assmin__badge assmin__badge--freshness assmin__badge--${value}`}>{value}</span>
}

function SourceTable({ title, rows }: { title: string; rows: ReportSourceRow[] }) {
  if (rows.length === 0) {
    return null
  }

  return (
    <section className="assmin__panel">
      <SectionTitle title={title} meta={`${rows.length} nguồn`} />
      <div className="assmin__table-shell">
        <table className="assmin__table">
          <thead>
            <tr>
              <th>Nguồn</th>
              <th>Trạng thái</th>
              <th>Độ mới</th>
              <th>Cập nhật</th>
              <th>Kiểm tra</th>
              <th>Chi tiết</th>
              <th>Cảnh báo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                <td>
                  <div className="assmin__cell-stack">
                    <strong>{row.label}</strong>
                    <span>{row.kind}</span>
                    {row.sourceUrl ? (
                      <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                        Mở nguồn
                      </a>
                    ) : null}
                  </div>
                </td>
                <td><StatusBadge value={row.status} /></td>
                <td><FreshnessBadge value={row.freshnessLabel} /></td>
                <td>{formatTimestamp(row.lastUpdated)}</td>
                <td>{formatTimestamp(row.checkedAt)}</td>
                <td>
                  <div className="assmin__chip-list">
                    {row.details.map(detail => (
                      <span key={`${row.key}-${detail}`} className="assmin__chip">{detail}</span>
                    ))}
                  </div>
                </td>
                <td>
                  {row.warnings.length > 0 ? (
                    <div className="assmin__warning-list">
                      {row.warnings.map(warning => (
                        <span key={`${row.key}-${warning.code}`} className={`assmin__warning assmin__warning--${warning.severity}`}>
                          {warning.message}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="assmin__muted">Không có</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function JobTable({ rows }: { rows: ReportJobRow[] }) {
  if (rows.length === 0) {
    return null
  }

  return (
    <section className="assmin__panel">
      <SectionTitle title="Runtime & jobs" meta={`${rows.length} job`} />
      <div className="assmin__table-shell">
        <table className="assmin__table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Nhóm</th>
              <th>Trạng thái</th>
              <th>Bật</th>
              <th>Cron</th>
              <th>Cập nhật</th>
              <th>Chi tiết</th>
              <th>Cảnh báo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                <td><strong>{row.label}</strong></td>
                <td>{groupLabel(row.group)}</td>
                <td><StatusBadge value={row.status} /></td>
                <td>{row.enabled ? 'Yes' : 'No'}</td>
                <td>{row.cron ?? '--'}</td>
                <td>{formatTimestamp(row.lastUpdated)}</td>
                <td>
                  <div className="assmin__chip-list">
                    {row.details.map(detail => (
                      <span key={`${row.key}-${detail}`} className="assmin__chip">{detail}</span>
                    ))}
                  </div>
                </td>
                <td>
                  {row.warnings.length > 0 ? (
                    <div className="assmin__warning-list">
                      {row.warnings.map(warning => (
                        <span key={`${row.key}-${warning.code}`} className={`assmin__warning assmin__warning--${warning.severity}`}>
                          {warning.message}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="assmin__muted">Không có</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function AssminReportPage() {
  const [report, setReport] = useState<AssminReportResponse>(EMPTY_REPORT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadReport() {
      setLoading(true)
      try {
        const response = await fetch(buildApiUrl('/api/assmin/report'))
        const json: AssminReportResponse & { error?: string } = await response.json()
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? 'Không thể tải báo cáo nguồn')
        }

        if (!active) {
          return
        }

        setReport(json)
        setError(null)
      } catch (fetchError) {
        if (!active) {
          return
        }

        setReport(EMPTY_REPORT)
        setError(fetchError instanceof Error ? fetchError.message : 'Không thể tải báo cáo nguồn')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadReport()

    return () => {
      active = false
    }
  }, [])

  const summary = useMemo(() => {
    const allRows = [...report.sources, ...report.jobs]
    return {
      ok: allRows.filter(row => row.status === 'ok').length,
      warning: allRows.filter(row => row.status === 'warning').length,
      critical: allRows.filter(row => row.status === 'critical').length,
      unknown: allRows.filter(row => row.status === 'unknown').length,
    }
  }, [report.jobs, report.sources])

  const sourcesByGroup = useMemo(() => {
    return report.sources.reduce<Record<string, ReportSourceRow[]>>((acc, row) => {
      const key = row.group
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(row)
      return acc
    }, {})
  }, [report.sources])

  return (
    <main className="assmin">
      <section className="assmin__hero">
        <div>
          <span className="assmin__eyebrow">/assmin</span>
          <h1>Báo cáo nguồn dữ liệu</h1>
          <p>Trang report read-only cho nguồn đang kéo về, độ mới dữ liệu, runtime và cảnh báo.</p>
        </div>
        <div className="assmin__hero-meta">
          <StatusBadge value={report.overallStatus} />
          <span>Tạo lúc: {formatTimestamp(report.generatedAt)}</span>
          <button type="button" className="assmin__reload" onClick={() => window.location.reload()}>
            Tải lại trang
          </button>
        </div>
      </section>

      <section className="assmin__summary-grid">
        <article className="assmin__summary-card">
          <span>Tổng OK</span>
          <strong>{summary.ok}</strong>
        </article>
        <article className="assmin__summary-card">
          <span>Cảnh báo</span>
          <strong>{summary.warning}</strong>
        </article>
        <article className="assmin__summary-card">
          <span>Nghiêm trọng</span>
          <strong>{summary.critical}</strong>
        </article>
        <article className="assmin__summary-card">
          <span>Chưa rõ</span>
          <strong>{summary.unknown}</strong>
        </article>
      </section>

      <section className="assmin__panel">
        <SectionTitle title="Runtime" meta="Tình trạng kết nối và quyền đọc dữ liệu" />
        <div className="assmin__runtime-grid">
          <div className="assmin__runtime-card">
            <span>Supabase read config</span>
            <strong>{report.runtime.hasSupabaseReadConfig ? 'Available' : 'Missing'}</strong>
          </div>
          <div className="assmin__runtime-card">
            <span>Supabase admin config</span>
            <strong>{report.runtime.hasSupabaseAdminConfig ? 'Available' : 'Missing'}</strong>
          </div>
          <div className="assmin__runtime-card">
            <span>Service role</span>
            <strong>{report.runtime.missingServiceRole ? 'Thiếu' : 'Ổn'}</strong>
          </div>
        </div>
      </section>

      {error ? <div className="assmin__error">{error}</div> : null}
      {loading ? <div className="assmin__loading">Đang tải báo cáo...</div> : null}

      {!loading ? (
        <>
          <JobTable rows={report.jobs} />
          <SourceTable title={groupLabel('news')} rows={sourcesByGroup.news ?? []} />
          <SourceTable title={groupLabel('vn_prices')} rows={sourcesByGroup.vn_prices ?? []} />
          <SourceTable title={groupLabel('export_registry')} rows={sourcesByGroup.export_registry ?? []} />
          <SourceTable title={groupLabel('weather')} rows={sourcesByGroup.weather ?? []} />

          <section className="assmin__panel">
            <SectionTitle title="Cảnh báo hiện tại" meta={`${report.warnings.length} mục`} />
            {report.warnings.length > 0 ? (
              <div className="assmin__warning-board">
                {report.warnings.map((warning, index) => (
                  <article key={`${warning.code}-${index}`} className={`assmin__warning-card assmin__warning-card--${warning.severity}`}>
                    <StatusBadge value={warning.severity} />
                    <p>{warning.message}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="assmin__muted">Không có cảnh báo hoạt động.</div>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}
