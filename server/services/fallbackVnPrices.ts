import type { CrawledDayData, CrawledPriceItem, SourceSnapshot } from './crawlers/types.js';

function makeItem(
  commodity: string,
  commodityName: string,
  category: string,
  region: string,
  price: number,
  previousPrice: number,
  unit: string,
  timestamp: string,
): CrawledPriceItem {
  const change = price - previousPrice;
  const changePct = previousPrice > 0 ? Number(((change / previousPrice) * 100).toFixed(2)) : null;

  return {
    commodity,
    commodityName,
    category,
    region,
    price,
    unit,
    change,
    changePct,
    timestamp,
    source: 'fallback',
    previousPrice,
  };
}

export function buildFallbackDayData(now = new Date()): CrawledDayData {
  const timestamp = now.toISOString();
  const date = timestamp.slice(0, 10);

  const items: CrawledPriceItem[] = [
    makeItem('ca-phe-robusta', 'Cà phê Robusta', 'Cây công nghiệp', 'Đắk Lắk', 87000, 88000, 'VND/kg', timestamp),
    makeItem('ca-phe-robusta', 'Cà phê Robusta', 'Cây công nghiệp', 'Đắk Nông', 87000, 88000, 'VND/kg', timestamp),
    makeItem('ca-phe-robusta', 'Cà phê Robusta', 'Cây công nghiệp', 'Gia Lai', 87000, 88000, 'VND/kg', timestamp),
    makeItem('ca-phe-robusta', 'Cà phê Robusta', 'Cây công nghiệp', 'Lâm Đồng', 86500, 87500, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Hồ tiêu', 'Cây công nghiệp', 'Đắk Lắk', 142000, 142000, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Hồ tiêu', 'Cây công nghiệp', 'Đắk Nông', 141000, 141000, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Hồ tiêu', 'Cây công nghiệp', 'Gia Lai', 138000, 138000, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Hồ tiêu', 'Cây công nghiệp', 'Bà Rịa - Vũng Tàu', 140000, 140000, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Hồ tiêu', 'Cây công nghiệp', 'Bình Phước', 140000, 140000, 'VND/kg', timestamp),
    makeItem('heo-hoi', 'Heo hơi', 'Chăn nuôi', 'Miền Bắc', 65000, 65000, 'VND/kg', timestamp),
    makeItem('heo-hoi', 'Heo hơi', 'Chăn nuôi', 'Miền Trung - Tây Nguyên', 67000, 67000, 'VND/kg', timestamp),
    makeItem('heo-hoi', 'Heo hơi', 'Chăn nuôi', 'Miền Nam', 68500, 68500, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lúa gạo ĐBSCL', 'Lương thực', 'IR 504', 8425, 8425, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lúa gạo ĐBSCL', 'Lương thực', 'OM 18', 8775, 8775, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lúa gạo ĐBSCL', 'Lương thực', 'CL 555', 8700, 8600, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lúa gạo ĐBSCL', 'Lương thực', 'OM 5451', 8700, 8700, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lúa gạo ĐBSCL', 'Lương thực', 'Đài Thơm 8', 9300, 9300, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lúa gạo ĐBSCL', 'Lương thực', 'OM 380', 7550, 7550, 'VND/kg', timestamp),
  ];

  const sources: SourceSnapshot[] = [
    {
      id: 'fallback',
      label: 'Fallback static data',
      url: 'local://fallback',
      fetchedAt: timestamp,
      success: true,
      itemCount: items.length,
      priority: 0,
      coverage: ['ca-phe-robusta', 'ho-tieu', 'heo-hoi', 'gao-noi-dia'],
    },
  ];

  return { date, items, sources };
}
