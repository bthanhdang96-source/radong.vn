export type Category =
  | 'Tất cả'
  | 'Lương thực'
  | 'Cây công nghiệp'
  | 'Rau củ quả'
  | 'Thủy sản'
  | 'Chăn nuôi';

export interface NongSanItem {
  id: string;
  ten: string;             // Product name
  tenEn: string;           // English name
  category: Category;
  donVi: string;           // Unit (kg, tấn, etc.)
  giaCurrent: number;      // Current price (VND)
  giaHom_qua: number;      // Yesterday's price
  giaTuanTruoc: number;    // Last week's price
  giaThangtruoc: number;   // Last month's price
  thayDoi: number;         // Change amount (VND)
  thayDoiPct: number;      // Change percentage
  low52w: number;          // 52 week low
  high52w: number;         // 52 week high
  khuyenNghi: 'Mua' | 'Bán' | 'Giữ';
  icon: string;            // Emoji icon
}

// Helper to compute change
function makeItem(
  id: string,
  ten: string,
  tenEn: string,
  category: Category,
  donVi: string,
  gia: number,
  giaHomQua: number,
  giaTuanTruoc: number,
  giaThangTruoc: number,
  low52w: number,
  high52w: number,
  khuyenNghi: 'Mua' | 'Bán' | 'Giữ',
  icon: string,
): NongSanItem {
  const thayDoi = gia - giaHomQua;
  const thayDoiPct = parseFloat(((thayDoi / giaHomQua) * 100).toFixed(2));
  return {
    id,
    ten,
    tenEn,
    category,
    donVi,
    giaCurrent: gia,
    giaHom_qua: giaHomQua,
    giaTuanTruoc,
    giaThangtruoc: giaThangTruoc,
    thayDoi,
    thayDoiPct,
    low52w,
    high52w,
    khuyenNghi,
    icon,
  };
}

export const NONG_SAN_DATA: NongSanItem[] = [
  // ── Lương thực ──
  makeItem('gao-st25',   'Gạo ST25',          'ST25 Rice',          'Lương thực', 'VND/kg',  28500, 27800, 27200, 26500, 24000, 31000, 'Mua',  '🌾'),
  makeItem('gao-jasmine','Gạo Jasmine',        'Jasmine Rice',       'Lương thực', 'VND/kg',  19200, 19500, 19100, 18400, 16500, 21000, 'Giữ',  '🌾'),
  makeItem('gao-om5451', 'Gạo OM5451',         'OM5451 Rice',        'Lương thực', 'VND/kg',  14700, 14600, 14200, 13800, 12500, 16000, 'Mua',  '🌾'),
  makeItem('ngo',        'Ngô',                'Corn',               'Lương thực', 'VND/kg',   6850,  6900,  6750,  6400,  5800,  7500, 'Giữ',  '🌽'),
  makeItem('san',        'Sắn',                'Cassava',            'Lương thực', 'VND/kg',   3200,  3150,  3050,  2900,  2400,  3600, 'Mua',  '🥔'),
  makeItem('dau-tuong',  'Đậu tương',          'Soybean',            'Lương thực', 'VND/kg',  18400, 18100, 17800, 17200, 15500, 20000, 'Giữ',  '🫘'),

  // ── Cây công nghiệp ──
  makeItem('ca-phe-robusta','Cà phê Robusta',  'Robusta Coffee',     'Cây công nghiệp', 'VND/kg', 128000, 124500, 121000, 115000, 95000, 135000, 'Mua', '☕'),
  makeItem('ca-phe-arabica', 'Cà phê Arabica', 'Arabica Coffee',     'Cây công nghiệp', 'VND/kg', 156000, 153000, 149000, 142000, 118000, 168000, 'Mua', '☕'),
  makeItem('cao-su',     'Cao su',             'Natural Rubber',     'Cây công nghiệp', 'VND/kg',  43500, 44200, 43000, 41500, 36000, 48000, 'Giữ', '🌿'),
  makeItem('tieu-den',   'Tiêu đen',           'Black Pepper',       'Cây công nghiệp', 'VND/kg',  72000, 71000, 69500, 66000, 58000, 78000, 'Mua', '🫙'),
  makeItem('hat-dieu',   'Hạt điều',           'Cashew Nut',         'Cây công nghiệp', 'VND/kg', 145000, 147000, 143000, 138000, 120000, 158000, 'Bán', '🥜'),
  makeItem('che',        'Chè búp tươi',       'Fresh Tea Bud',      'Cây công nghiệp', 'VND/kg',   8500,  8300,  8100,  7800,  6500,  9500, 'Mua', '🍵'),
  makeItem('mia',        'Mía',                'Sugarcane',          'Cây công nghiệp', 'VND/tấn', 1150000, 1120000, 1080000, 1050000, 900000, 1250000, 'Mua', '🌿'),
  makeItem('dua-kho',    'Dừa khô',            'Dried Coconut',      'Cây công nghiệp', 'VND/quả',  9800, 9500, 9200, 8700, 7000, 11000, 'Mua', '🥥'),

  // ── Rau củ quả ──
  makeItem('thanh-long', 'Thanh Long',         'Dragon Fruit',       'Rau củ quả', 'VND/kg',  12500, 13000, 12200, 11500, 8000, 22000, 'Giữ', '🐉'),
  makeItem('xoai-cat',   'Xoài cát Hòa Lộc',  'Hoa Loc Mango',      'Rau củ quả', 'VND/kg',  38000, 37000, 35500, 32000, 25000, 55000, 'Mua', '🥭'),
  makeItem('mit-ruot-do','Mít ruột đỏ',        'Jackfruit',          'Rau củ quả', 'VND/kg',  24000, 24500, 23000, 21000, 15000, 32000, 'Giữ', '🫐'),
  makeItem('chom-chom',  'Chôm chôm',          'Rambutan',           'Rau củ quả', 'VND/kg',  18000, 17500, 16800, 15500, 10000, 28000, 'Mua', '🍒'),
  makeItem('buoi',       'Bưởi da xanh',       'Green Pomelo',       'Rau củ quả', 'VND/kg',  45000, 43500, 42000, 39000, 30000, 55000, 'Mua', '🍊'),
  makeItem('durian',     'Sầu riêng',          'Durian',             'Rau củ quả', 'VND/kg',  85000, 88000, 82000, 75000, 55000, 120000,'Giữ', '🌵'),
  makeItem('khoai-lang', 'Khoai lang tím',     'Purple Sweet Potato','Rau củ quả', 'VND/kg',  12000, 11500, 11000, 10500, 8000, 14000, 'Mua', '🍠'),
  makeItem('hanh-tim',   'Hành tím',           'Shallot',            'Rau củ quả', 'VND/kg',  28000, 26000, 25000, 22000, 15000, 45000, 'Mua', '🧅'),
  makeItem('tom-chuoi',  'Chuối già hương',    'Lady Finger Banana', 'Rau củ quả', 'VND/kg',   8500,  8200,  7900,  7400,  5500, 12000, 'Giữ', '🍌'),

  // ── Thủy sản ──
  makeItem('tom-the',    'Tôm thẻ chân trắng','White-leg Shrimp',   'Thủy sản', 'VND/kg', 142000, 140000, 138000, 133000, 118000, 165000, 'Mua', '🦐'),
  makeItem('tom-su',     'Tôm sú',             'Tiger Prawn',        'Thủy sản', 'VND/kg', 198000, 195000, 191000, 185000, 168000, 220000, 'Mua', '🦐'),
  makeItem('ca-tra',     'Cá tra',             'Pangasius',          'Thủy sản', 'VND/kg',  32000, 31500, 30800, 29500, 27000, 35000, 'Giữ', '🐟'),
  makeItem('ca-basa',    'Cá basa',            'Basa Fish',          'Thủy sản', 'VND/kg',  35000, 35500, 34200, 33000, 30000, 38500, 'Giữ', '🐠'),
  makeItem('muc-ong',    'Mực ống',            'Squid',              'Thủy sản', 'VND/kg',  98000, 95000, 92000, 88000, 78000, 115000, 'Mua', '🦑'),
  makeItem('cua-bien',   'Cua biển',           'Blue Crab',          'Thủy sản', 'VND/kg', 320000, 325000, 315000, 298000, 260000, 380000,'Giữ', '🦀'),

  // ── Chăn nuôi ──
  makeItem('heo-ho',     'Heo hơi',            'Live Pig',           'Chăn nuôi', 'VND/kg',  65000, 63500, 61000, 58000, 52000, 72000, 'Mua', '🐖'),
  makeItem('ga-ta',      'Gà ta hơi',          'Free-range Chicken', 'Chăn nuôi', 'VND/kg',  72000, 72500, 70000, 68000, 62000, 82000, 'Giữ', '🐔'),
  makeItem('ga-cong',    'Gà công nghiệp',     'Commercial Chicken', 'Chăn nuôi', 'VND/kg',  42000, 41000, 40000, 38500, 34000, 48000, 'Mua', '🐓'),
  makeItem('trung-ga',   'Trứng gà',           'Chicken Egg',        'Chăn nuôi', 'VND/quả',  3200,  3100,  3000,  2850,  2400,  3800, 'Mua', '🥚'),
  makeItem('sua-bo',     'Sữa bò tươi',        'Fresh Cow Milk',     'Chăn nuôi', 'VND/lít', 16500, 16200, 15800, 15200, 14000, 18000, 'Giữ', '🥛'),
  makeItem('vit-hoi',    'Vịt hơi',            'Live Duck',          'Chăn nuôi', 'VND/kg',  55000, 54000, 52500, 50000, 45000, 62000, 'Mua', '🦆'),
];

export const CATEGORIES: Category[] = [
  'Tất cả',
  'Lương thực',
  'Cây công nghiệp',
  'Rau củ quả',
  'Thủy sản',
  'Chăn nuôi',
];

export const CATEGORY_ICONS: Record<Category, string> = {
  'Tất cả': '📊',
  'Lương thực': '🌾',
  'Cây công nghiệp': '🌿',
  'Rau củ quả': '🥦',
  'Thủy sản': '🦐',
  'Chăn nuôi': '🐖',
};

// Ticker items: top movers + important items for scrolling bar
export const TICKER_ITEMS = NONG_SAN_DATA.filter(
  (_, i) => i % 3 === 0,
).concat(NONG_SAN_DATA.filter((item) => Math.abs(item.thayDoiPct) > 1));
