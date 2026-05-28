import type { AgriAdvisory, ForecastDay, ForecastHour } from './types.js'

type AdvisoryDraft = AgriAdvisory & {
  rank: number
}

function severityRank(severity: AgriAdvisory['severity']) {
  switch (severity) {
    case 'critical':
      return 3
    case 'warning':
      return 2
    default:
      return 1
  }
}

function createAdvisory(draft: Omit<AdvisoryDraft, 'rank'>): AdvisoryDraft {
  return {
    ...draft,
    rank: severityRank(draft.severity),
  }
}

function findHourWindow(hours: ForecastHour[], predicate: (hour: ForecastHour) => boolean) {
  const matches = hours.filter(predicate)
  if (matches.length === 0) {
    return null
  }

  return {
    start: matches[0].time,
    end: matches[matches.length - 1].time,
  }
}

export function buildAgriAdvisories(input: {
  hourly72h: ForecastHour[]
  daily7d: ForecastDay[]
}): AgriAdvisory[] {
  const next24h = input.hourly72h.slice(0, 24)
  const next48h = input.hourly72h.slice(0, 48)
  const next72h = input.hourly72h.slice(0, 72)
  const advisories: AdvisoryDraft[] = []

  const rain24hTotal = next24h.reduce((sum, hour) => sum + (hour.rainMm ?? 0), 0)
  const heavyRainWindow = findHourWindow(next24h, hour => (hour.rainMm ?? 0) >= 8 || (hour.rainProbabilityPct ?? 0) >= 80)
  if (rain24hTotal >= 18 || heavyRainWindow) {
    advisories.push(
      createAdvisory({
        id: 'rain_warning',
        severity: rain24hTotal >= 30 ? 'critical' : 'warning',
        title: 'Mưa lớn có thể làm chậm nguồn hàng',
        message:
          rain24hTotal >= 30
            ? 'Lượng mưa 24 giờ tới ở mức cao. Cần thận trọng khi đánh giá khả năng thu gom, vận chuyển và chất lượng hàng sau mưa.'
            : 'Khả năng có đợt mưa đáng kể trong 24 giờ tới. Đây là tín hiệu có thể ảnh hưởng nhịp đưa hàng ra thị trường và chi phí logistics ngắn hạn.',
        windowStart: heavyRainWindow?.start ?? next24h[0]?.time ?? new Date().toISOString(),
        windowEnd: heavyRainWindow?.end ?? next24h[next24h.length - 1]?.time ?? new Date().toISOString(),
        basedOn: ['rain'],
      }),
    )
  }

  const sprayWindow = findHourWindow(next24h, hour => (hour.windKph ?? 0) >= 20 || (hour.rainProbabilityPct ?? 0) >= 50 || (hour.rainMm ?? 0) >= 1)
  if (sprayWindow) {
    advisories.push(
      createAdvisory({
        id: 'spray_caution',
        severity: 'warning',
        title: 'Gió hoặc mưa có thể ảnh hưởng logistics',
        message:
          'Gió mạnh hoặc mưa cận giờ có thể làm tăng rủi ro chậm vận chuyển, phân loại và giao nhận. Tín hiệu này nên được đối chiếu với lịch gom hàng thực tế.',
        windowStart: sprayWindow.start,
        windowEnd: sprayWindow.end,
        basedOn: ['rain', 'wind'],
      }),
    )
  }

  const heatWindow = findHourWindow(next48h, hour => (hour.tempC ?? 0) >= 35 || (hour.uv ?? 0) >= 8)
  if (heatWindow) {
    const peakTemp = Math.max(...next48h.map(hour => hour.tempC ?? -Infinity))
    advisories.push(
      createAdvisory({
        id: 'heat_stress',
        severity: peakTemp >= 38 ? 'critical' : 'warning',
        title: 'Nắng nóng có thể ảnh hưởng chất lượng và sản lượng',
        message:
          peakTemp >= 38
            ? 'Nhiệt độ cực đại dự kiến rất cao. Đây là tín hiệu cần theo dõi khi đánh giá rủi ro hụt sản lượng, hao hụt sau thu hoạch và biến động giá.'
            : 'Nắng nóng và UV cao có thể làm tăng áp lực chất lượng hàng. Tác động giá cần được đối chiếu thêm với tiến độ thu hoạch và nhu cầu mua.',
        windowStart: heatWindow.start,
        windowEnd: heatWindow.end,
        basedOn: ['temperature', 'uv'],
      }),
    )
  }

  const diseaseRiskHours = next48h.filter(
    hour =>
      (hour.humidityPct ?? 0) >= 85 &&
      (hour.tempC ?? 0) >= 20 &&
      (hour.tempC ?? 0) <= 31 &&
      ((hour.rainMm ?? 0) > 0.3 || (hour.rainProbabilityPct ?? 0) >= 60),
  )
  if (diseaseRiskHours.length >= 6) {
    advisories.push(
      createAdvisory({
        id: 'disease_risk',
        severity: 'warning',
        title: 'Độ ẩm cao làm tăng rủi ro chất lượng',
        message:
          'Độ ẩm cao kéo dài kèm mưa có thể làm tăng rủi ro giảm phẩm cấp hoặc hao hụt sau thu hoạch. Tín hiệu này phù hợp để theo dõi chênh lệch giá theo chất lượng.',
        windowStart: diseaseRiskHours[0].time,
        windowEnd: diseaseRiskHours[diseaseRiskHours.length - 1].time,
        basedOn: ['humidity', 'rain', 'temperature'],
      }),
    )
  }

  const nextTwoDays = input.daily7d.slice(0, 2)
  const totalEt0 = nextTwoDays.reduce((sum, day) => sum + (day.et0Mm ?? 0), 0)
  const totalRain48h = next48h.reduce((sum, hour) => sum + (hour.rainMm ?? 0), 0)
  const averageHumidity48h =
    next48h.length > 0 ? next48h.reduce((sum, hour) => sum + (hour.humidityPct ?? 0), 0) / next48h.length : 0

  if (totalRain48h < 3 && averageHumidity48h < 60 && totalEt0 >= 8) {
    advisories.push(
      createAdvisory({
        id: 'irrigation_watch',
        severity: totalEt0 >= 10 ? 'warning' : 'info',
        title: 'Khô nóng có thể tạo áp lực nguồn cung',
        message:
          '48 giờ tới ít mưa, bốc thoát hơi cao và ẩm không khí thấp. Đây là tín hiệu cần theo dõi khi đánh giá rủi ro sản lượng và kỳ vọng giá ngắn hạn.',
        windowStart: next48h[0]?.time ?? new Date().toISOString(),
        windowEnd: next48h[next48h.length - 1]?.time ?? new Date().toISOString(),
        basedOn: ['rain', 'humidity', 'et0'],
      }),
    )
  }

  if (advisories.length === 0) {
    advisories.push(
      createAdvisory({
        id: 'stable_window',
        severity: 'info',
        title: 'Tín hiệu thời tiết ngắn hạn tương đối ổn định',
        message:
          'Chưa thấy tín hiệu thời tiết cực đoan nổi bật trong 48 giờ tới. Biến động giá nếu có nhiều khả năng cần đối chiếu thêm với nhu cầu mua, tồn kho và lịch giao hàng.',
        windowStart: next72h[0]?.time ?? new Date().toISOString(),
        windowEnd: next72h[Math.min(next72h.length - 1, 23)]?.time ?? new Date().toISOString(),
        basedOn: ['rain', 'temperature'],
      }),
    )
  }

  return advisories
    .sort((left, right) => right.rank - left.rank || left.title.localeCompare(right.title, 'vi-VN'))
    .slice(0, 3)
    .map(advisory => ({
      id: advisory.id,
      severity: advisory.severity,
      title: advisory.title,
      message: advisory.message,
      windowStart: advisory.windowStart,
      windowEnd: advisory.windowEnd,
      basedOn: advisory.basedOn,
    }))
}
