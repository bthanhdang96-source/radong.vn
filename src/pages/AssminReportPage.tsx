import { useEffect, useState } from 'react'
import type { AssminReportResponse, ReportSeverity } from '../data/assminReportTypes'
import { buildApiUrl } from '../lib/api'
import './AssminReportPage.css'

const EMPTY_REPORT: AssminReportResponse = {
  success: true,
  generatedAt: '',
  overallStatus: 'unknown',
  summary: {
    ok: 0,
    warning: 0,
    critical: 0,
    unknown: 0,
    sources: 0,
    jobs: 0,
    warnings: 0,
  },
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

  return (
    <main className="assmin">
      <section className="assmin__hero">
        <div>
          <span className="assmin__eyebrow">/assmin</span>
          <h1>Báo cáo nguồn dữ liệu</h1>
          <p>Trang tổng quan read-only cho tình trạng nguồn dữ liệu. Chi tiết vận hành đã được giới hạn cho admin.</p>
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
          <strong>{report.summary.ok}</strong>
        </article>
        <article className="assmin__summary-card">
          <span>Cảnh báo</span>
          <strong>{report.summary.warning}</strong>
        </article>
        <article className="assmin__summary-card">
          <span>Nghiêm trọng</span>
          <strong>{report.summary.critical}</strong>
        </article>
        <article className="assmin__summary-card">
          <span>Chưa rõ</span>
          <strong>{report.summary.unknown}</strong>
        </article>
      </section>

      <section className="assmin__panel">
        <SectionTitle title="Tổng quan công khai" meta="Không hiển thị runtime config, URL nguồn, cron, lỗi nội bộ hoặc hàng chờ review." />
        <div className="assmin__runtime-grid">
          <div className="assmin__runtime-card">
            <span>Nguồn đang theo dõi</span>
            <strong>{report.summary.sources}</strong>
          </div>
          <div className="assmin__runtime-card">
            <span>Job/dataset</span>
            <strong>{report.summary.jobs}</strong>
          </div>
          <div className="assmin__runtime-card">
            <span>Cảnh báo hoạt động</span>
            <strong>{report.summary.warnings}</strong>
          </div>
        </div>
      </section>

      {error ? <div className="assmin__error">{error}</div> : null}
      {loading ? <div className="assmin__loading">Đang tải báo cáo...</div> : null}
    </main>
  )
}
