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
    makeItem('ca-phe-robusta', 'Ca phe Robusta', 'Cay cong nghiep', 'Dak Lak', 87000, 88000, 'VND/kg', timestamp),
    makeItem('ca-phe-robusta', 'Ca phe Robusta', 'Cay cong nghiep', 'Dak Nong', 87000, 88000, 'VND/kg', timestamp),
    makeItem('ca-phe-robusta', 'Ca phe Robusta', 'Cay cong nghiep', 'Gia Lai', 87000, 88000, 'VND/kg', timestamp),
    makeItem('ca-phe-robusta', 'Ca phe Robusta', 'Cay cong nghiep', 'Lam Dong', 86500, 87500, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Ho tieu', 'Cay cong nghiep', 'Dak Lak', 142000, 142000, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Ho tieu', 'Cay cong nghiep', 'Dak Nong', 141000, 141000, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Ho tieu', 'Cay cong nghiep', 'Gia Lai', 138000, 138000, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Ho tieu', 'Cay cong nghiep', 'Ba Ria - Vung Tau', 140000, 140000, 'VND/kg', timestamp),
    makeItem('ho-tieu', 'Ho tieu', 'Cay cong nghiep', 'Binh Phuoc', 140000, 140000, 'VND/kg', timestamp),
    makeItem('heo-hoi', 'Heo hoi', 'Chan nuoi', 'Mien Bac', 65000, 65000, 'VND/kg', timestamp),
    makeItem('heo-hoi', 'Heo hoi', 'Chan nuoi', 'Mien Trung - Tay Nguyen', 67000, 67000, 'VND/kg', timestamp),
    makeItem('heo-hoi', 'Heo hoi', 'Chan nuoi', 'Mien Nam', 68500, 68500, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', 'IR 504', 8425, 8425, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', 'OM 18', 8775, 8775, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', 'CL 555', 8700, 8600, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', 'OM 5451', 8700, 8700, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', 'Dai Thom 8', 9300, 9300, 'VND/kg', timestamp),
    makeItem('gao-noi-dia', 'Lua gao DBSCL', 'Luong thuc', 'OM 380', 7550, 7550, 'VND/kg', timestamp),
  ];

  const sources: SourceSnapshot[] = [
    {
      id: 'fallback',
      label: 'Fallback static data',
      url: 'local://fallback',
      fetchedAt: timestamp,
      success: true,
      itemCount: items.length,
    },
  ];

  return { date, items, sources };
}
