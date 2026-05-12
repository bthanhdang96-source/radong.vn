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
        title: 'Cảnh báo mưa ảnh hưởng đồng ruộng',
        message:
          rain24hTotal >= 30
            ? 'Lượng mưa 24 giờ tới ở mức cao. Nên kiểm tra thoát nước, che phủ vật tư và tránh thu hoạch lúc đỉnh mưa.'
            : 'Khả năng có đợt mưa đáng kể trong 24 giờ tới. Nên chủ động lịch tưới và tránh phun khi mưa cận kề.',
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
        title: 'Cân nhắc hoãn phun thuốc hoặc bón lá',
        message: 'Gió mạnh hoặc mưa cận giờ có thể làm giảm hiệu quả phun. Nên ưu tiên khung giờ khô ráo, gió nhẹ.',
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
        title: 'Nguy cơ sốc nhiệt trên cây trồng và lao động ngoài trời',
        message:
          peakTemp >= 38
            ? 'Nhiệt độ cực đại dự kiến rất cao. Nên tăng che phủ, giữ ẩm và hạn chế thao tác nặng ngoài trời giữa trưa.'
            : 'Nắng nóng và UV cao có thể làm cây mất nước nhanh. Nên ưu tiên tưới sớm hoặc chiều muộn.',
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
        title: 'Điều kiện thuận lợi cho nấm bệnh',
        message: 'Độ ẩm cao kéo dài kèm mưa làm tăng nguy cơ nấm bệnh. Nên tăng theo dõi tán lá, thoáng vườn và tiêu nước mặt.',
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
        title: 'Theo dõi nhu cầu tưới bổ sung',
        message: '48 giờ tới ít mưa, bốc thoát hơi cao và ẩm không khí thấp. Nên kiểm tra ẩm đất và ưu tiên tưới tiết kiệm theo lô.',
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
        title: 'Điều kiện ngắn hạn tương đối ổn định',
        message: 'Chưa thấy tín hiệu thời tiết cực đoan nổi bật trong 48 giờ tới. Vẫn nên theo dõi cập nhật trước các công việc nhạy cảm với mưa.',
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
