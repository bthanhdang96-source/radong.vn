# Data Model v2 — AgriData VN (5-Layer Price System)
> Đây là bản cập nhật của data-model-supabase-prompt.md.
> Thay thế hoàn toàn file cũ. AI coding đọc file này để refactor schema.

---

## Thay đổi so với v1

```
v1: price_observations dùng market_type = 'farm_gate'|'wholesale'|'retail'|'export'
v2: Thêm price_type riêng biệt gồm 5 lớp + tách bảng world_prices
    Thêm source_type chi tiết hơn (crawl_news, crawl_ecom, crawl_gov, customs...)
    Thêm price_chain_summary materialized view (tổng hợp 5 lớp cùng 1 mặt hàng)
    Thêm article_title, market_name, country_code
    Thêm exchange_rate vào price_observations để track tỷ giá tại thời điểm ghi
```

---

## Bối cảnh & Mục tiêu

Nền tảng dữ liệu giá nông sản Việt Nam. Tổng hợp và hiển thị đầy đủ **chuỗi giá trị** từ farm gate đến thị trường thế giới, giúp:
- Nông dân biết giá thu mua và giá thị trường để quyết định bán/giữ
- Thương lái biết spread giữa các vùng và các kênh
- Doanh nghiệp xuất khẩu so sánh giá nội địa vs giá FOB vs giá thế giới
- AI chatbot có context đầy đủ để tư vấn

**5 câu hỏi data model phải trả lời được:**
1. Giá sầu riêng tại Đắk Lắk hôm nay theo từng kênh (farm gate / chợ / siêu thị) là bao nhiêu?
2. Margin từ farm gate đến bán lẻ đang là bao nhiêu %?
3. Giá xuất khẩu cà phê FOB hôm nay so với giá ICE London như thế nào?
4. Nguồn nào đang báo giá và độ tin cậy ra sao?
5. Xu hướng 7 ngày / 30 ngày của từng lớp giá?

---

## Kiến trúc 5 lớp giá

```
Lớp 1 — farm_gate   : Giá thương lái trả tại vườn/ruộng
                       Nguồn: crowdsource, HTX, agro.gov.vn
                       Confidence: 0.60–0.85
                       Frequency: hàng ngày

Lớp 2 — wholesale   : Giá chợ đầu mối, bán buôn
                       Nguồn: nongnghiep.vn, vietnambiz, báo tỉnh
                       Confidence: 0.70–0.85
                       Frequency: hàng ngày

Lớp 3 — retail      : Giá bán lẻ người tiêu dùng cuối
                       Nguồn: Shopee, Lazada, Bách Hoá Xanh, TMĐT
                       Confidence: 0.65–0.75
                       Frequency: hàng ngày

Lớp 4 — export      : Giá xuất khẩu FOB/CIF tại cảng Việt Nam
                       Nguồn: customs.gov.vn, VASEP, vinanet
                       Confidence: 0.90–0.95
                       Frequency: hàng tuần

Lớp 5 — world       : Giá sàn giao dịch quốc tế
                       Nguồn: ICE, CBOT, SGX, FAO, World Bank
                       Confidence: 0.95–1.0
                       Frequency: real-time / hàng ngày
                       → Lưu vào bảng world_prices riêng
```

---

## Nguyên tắc thiết kế — đọc trước khi viết SQL

```
1. price_type là trường phân loại cốt lõi — KHÔNG dùng market_type như v1
   Lý do: market_type ở v1 chỉ có 4 giá trị, thiếu 'world'
           price_type rõ ràng hơn về ngữ nghĩa

2. world_prices tách thành bảng riêng
   Lý do: schema khác hoàn toàn (USD, đơn vị sàn, contract month)
           Không nên ép vào price_observations với price_vnd NULL

3. source_type chi tiết hơn source ở v1
   v1: source = 'agro_gov', 'shopee'...
   v2: source_type = 'crawl_news' | 'crawl_ecom' | 'crawl_gov'
                   | 'customs' | 'world_exchange' | 'crowdsource' | 'api_partner'
       source_name = 'vietnambiz', 'shopee', 'customs_gov'... (tên cụ thể)
   Lý do: phân biệt loại nguồn vs tên nguồn → query linh hoạt hơn

4. Luôn lưu exchange_rate tại thời điểm ghi
   Lý do: tỷ giá thay đổi → cần biết quy đổi theo tỷ giá lúc đó
           Không thể tính ngược sau này nếu không lưu

5. price_vnd và price_usd song song
   price_vnd: bắt buộc cho lớp 1-3, NULL cho lớp 5 nếu chưa quy đổi
   price_usd: bắt buộc cho lớp 4-5, tính từ price_vnd/exchange_rate cho 1-3

6. price_chain_summary materialized view tổng hợp tất cả lớp
   API trang chủ đọc từ đây — không query thẳng price_observations
   Refresh mỗi 30 phút

7. Giữ nguyên raw_payload JSONB — không bao giờ bỏ
   Lý do: debug khi parser sai, re-process khi cần

8. Confidence threshold:
   API public (bảng giá website): >= 0.5
   Tính toán trung bình / index: >= 0.6
   Hiển thị "verified": >= 0.85 hoặc is_verified = TRUE
```

---

## ZONE 1 — Raw Zone (không thay đổi so với v1)

```sql
CREATE TABLE raw_crawl_logs (
    id            BIGSERIAL PRIMARY KEY,
    source_name   TEXT NOT NULL,
    source_url    TEXT,
    html_snapshot TEXT,
    raw_json      JSONB,
    crawled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ingestion_errors (
    id          BIGSERIAL PRIMARY KEY,
    failed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_name TEXT,
    error_type  TEXT NOT NULL,
    -- 'schema_invalid' | 'unknown_commodity' | 'unparseable_price'
    -- 'unconvertible_unit' | 'below_minimum' | 'above_maximum'
    -- 'stale_data' | 'duplicate' | 'unknown_price_type'
    reason      TEXT,
    raw_payload JSONB
);

CREATE INDEX ON ingestion_errors (error_type, failed_at DESC);
CREATE INDEX ON ingestion_errors (source_name, failed_at DESC);
```

---

## ZONE 2 — Cleaned Zone

### Bảng lookup (tạo trước)

```sql
-- Danh mục nông sản (giữ nguyên từ v1, thêm hs_code_export)
CREATE TABLE commodities (
    id              SERIAL PRIMARY KEY,
    name_vi         TEXT NOT NULL,
    name_en         TEXT,
    slug            TEXT UNIQUE NOT NULL,
    hs_code         VARCHAR(10),
    hs_code_export  VARCHAR(10),  -- Mã HS khi xuất khẩu (có thể khác nhập khẩu)
    category        TEXT NOT NULL,
    -- 'fruit'|'rice'|'coffee'|'vegetable'|'seafood'|'spice'|'nut'|'rubber'
    unit_default    TEXT NOT NULL DEFAULT 'kg',
    world_exchange  TEXT,
    -- Sàn giao dịch thế giới tương ứng: 'ICE_LIFFE', 'CBOT', 'SGX'
    world_price_unit TEXT,
    -- Đơn vị trên sàn: 'USD/MT', 'USc/lb', 'USD/bushel'
    world_to_kg_factor FLOAT,
    -- Hệ số convert đơn vị sàn về kg:
    -- USD/MT → /1000 = USD/kg, factor = 0.001
    -- USc/lb → *2.20462/100 = USD/kg, factor = 0.022046
    -- USD/bushel corn → /25.4 = USD/kg, factor = 0.03937
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO commodities
    (name_vi, name_en, slug, hs_code, category, world_exchange, world_price_unit, world_to_kg_factor)
VALUES
    ('Sầu riêng',  'Durian',        'sau-rieng',   '0810.60', 'fruit',   NULL,         NULL,       NULL),
    ('Cà phê',     'Coffee Robusta','ca-phe',       '0901.11', 'coffee',  'ICE_LIFFE',  'USD/MT',   0.001),
    ('Lúa gạo',    'Rice',          'lua-gao',      '1006.10', 'rice',    'CBOT',       'USD/cwt',  0.022046),
    ('Gạo XK',     'Export Rice',   'gao-xuat-khau','1006.30', 'rice',    NULL,         NULL,       NULL),
    ('Tôm thẻ',    'Whiteleg Shrimp','tom-the',     '0306.17', 'seafood', NULL,         NULL,       NULL),
    ('Tôm sú',     'Tiger Shrimp',  'tom-su',       '0306.16', 'seafood', NULL,         NULL,       NULL),
    ('Cá tra',     'Pangasius',     'ca-tra',       '0302.73', 'seafood', NULL,         NULL,       NULL),
    ('Hồ tiêu',    'Black Pepper',  'tieu',         '0904.11', 'spice',   NULL,         NULL,       NULL),
    ('Điều',       'Cashew',        'dieu',         '0801.31', 'nut',     NULL,         NULL,       NULL),
    ('Thanh long', 'Dragon Fruit',  'thanh-long',   '0810.90', 'fruit',   NULL,         NULL,       NULL),
    ('Dưa hấu',    'Watermelon',    'dua-hau',      '0807.11', 'fruit',   NULL,         NULL,       NULL),
    ('Cao su',     'Rubber',        'cao-su',       '4001.10', 'rubber',  'SGX',        'USc/kg',   0.01),
    ('Mía đường',  'Sugarcane',     'mia-duong',    '1701.14', 'other',   NULL,         NULL,       NULL),
    ('Ngô',        'Corn',          'ngo',          '1005.90', 'grain',   'CBOT',       'USc/bushel',0.003937),
    ('Đậu tương',  'Soybean',       'dau-tuong',    '1201.90', 'grain',   'CBOT',       'USc/bushel',0.003674);


-- Tỉnh thành (giữ nguyên từ v1)
CREATE TABLE provinces (
    code          VARCHAR(3) PRIMARY KEY,
    name_vi       TEXT NOT NULL,
    name_en       TEXT,
    region        TEXT NOT NULL,
    -- 'north'|'central'|'south'|'highland'
    lat           FLOAT,
    lng           FLOAT,
    is_major_agri BOOLEAN DEFAULT FALSE
);

-- Seed 63 tỉnh thành (xem v1 để lấy đầy đủ)
INSERT INTO provinces (code, name_vi, region, lat, lng, is_major_agri) VALUES
    ('66', 'Đắk Lắk',    'highland', 12.7100, 108.2378, TRUE),
    ('68', 'Lâm Đồng',   'highland', 11.9465, 108.4419, TRUE),
    ('67', 'Đắk Nông',   'highland', 12.0046, 107.6878, TRUE),
    ('64', 'Gia Lai',    'highland', 13.9810, 108.0000, TRUE),
    ('82', 'Tiền Giang', 'south',    10.3600, 106.3600, TRUE),
    ('83', 'Bến Tre',    'south',    10.2415, 106.3759, TRUE),
    ('87', 'Đồng Tháp',  'south',    10.4938, 105.6882, TRUE),
    ('89', 'An Giang',   'south',    10.5216, 105.1259, TRUE),
    ('91', 'Kiên Giang', 'south',    10.0125, 105.0809, TRUE),
    ('92', 'Cần Thơ',    'south',    10.0341, 105.7224, TRUE),
    ('96', 'Cà Mau',     'south',     9.1769, 105.1500, TRUE),
    ('75', 'Đồng Nai',   'south',    11.0686, 107.1676, TRUE),
    ('80', 'Long An',    'south',    10.5354, 106.4102, TRUE),
    ('86', 'Vĩnh Long',  'south',    10.2538, 105.9722, TRUE),
    ('84', 'Trà Vinh',   'south',     9.9477, 106.3419, TRUE),
    ('94', 'Sóc Trăng',  'south',     9.6025, 105.9739, TRUE);
    -- Thêm 47 tỉnh còn lại theo chuẩn GSO


-- Cache thời tiết (không thay đổi)
CREATE TABLE weather_cache (
    province_code VARCHAR(3) PRIMARY KEY REFERENCES provinces(code),
    payload       JSONB NOT NULL,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ NOT NULL
);
```

### ⭐ Bảng price_observations — cập nhật lớn nhất

```sql
-- Lưu giá lớp 1, 2, 3, 4 (farm_gate, wholesale, retail, export)
-- Lớp 5 (world) lưu riêng vào world_prices
CREATE TABLE price_observations (
    id              BIGSERIAL PRIMARY KEY,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- === ĐỊNH DANH NÔNG SẢN ===
    commodity_id    INT NOT NULL REFERENCES commodities(id),
    commodity_slug  TEXT NOT NULL,
    -- Denormalize để tránh JOIN — sync qua trigger (xem bên dưới)
    variety         TEXT,
    -- 'Monthong' | 'Ri6' | 'Robusta' | 'IR504' | 'ST25'
    quality_grade   TEXT,
    -- 'loại 1' | 'loại 2' | 'xuất khẩu' | 'grade A' | 'TCVN'

    -- === ĐỊNH DANH ĐỊA LÝ ===
    province_code   VARCHAR(3) REFERENCES provinces(code),
    -- NULL = giá quốc gia hoặc giá xuất khẩu không gắn tỉnh
    market_name     TEXT,
    -- Tên cụ thể: 'Chợ đầu mối Thủ Đức', 'Cảng Cát Lái', 'WinMart Quận 1'
    country_code    VARCHAR(3) NOT NULL DEFAULT 'VNM',
    -- ISO 3166-1 alpha-3: 'VNM' cho trong nước

    -- === PHÂN LOẠI GIÁ ===
    price_type      TEXT NOT NULL,
    -- 'farm_gate' : Giá thương lái trả tại vườn — thấp nhất chuỗi
    -- 'wholesale'  : Giá chợ đầu mối / bán buôn
    -- 'retail'     : Giá bán lẻ người tiêu dùng cuối
    -- 'export'     : Giá FOB/CIF tại cảng — từ hải quan

    -- === GIÁ ===
    price_vnd       NUMERIC(14,2),
    -- VNĐ/kg sau khi normalize
    -- NULL nếu nguồn chỉ có USD và chưa quy đổi
    price_usd       NUMERIC(10,4),
    -- USD/kg — NULL cho giá farm_gate/wholesale/retail nếu không có
    -- Bắt buộc có cho price_type = 'export'
    unit            TEXT NOT NULL DEFAULT 'kg',
    -- Đơn vị sau normalize — luôn là 'kg' hoặc 'MT'
    exchange_rate   NUMERIC(10,2),
    -- Tỷ giá USD/VNĐ tại thời điểm ghi
    -- Dùng để quy đổi ngược về USD khi cần

    -- === NGUỒN DỮ LIỆU ===
    source_type     TEXT NOT NULL,
    -- 'crawl_news'     : Báo điện tử (vietnambiz, nongnghiep.vn, agrotrade)
    -- 'crawl_ecom'     : TMĐT (Shopee, Lazada, Tiki, Bách Hoá Xanh)
    -- 'crawl_gov'      : Cổng nhà nước (agro.gov.vn, moit.gov.vn, tỉnh thành)
    -- 'customs'        : File Excel hải quan (customs.gov.vn)
    -- 'crowdsource'    : Người dùng nhập tay qua app/form
    -- 'api_partner'    : API từ đối tác (VASEP, VPA, VICOFA, hiệp hội)

    source_name     TEXT,
    -- Tên cụ thể nguồn: 'vietnambiz', 'nongnghiep_vn', 'shopee',
    --                   'customs_gov', 'agro_gov', 'vasep'
    source_url      TEXT,
    article_title   TEXT,
    -- Tiêu đề bài báo nếu crawl từ tin tức
    -- Dùng để hiển thị "Theo [báo]: [tiêu đề]" trên UI

    -- === CHẤT LƯỢNG ===
    confidence      FLOAT NOT NULL DEFAULT 0.7
                    CHECK (confidence BETWEEN 0.0 AND 1.0),
    -- Base confidence theo source_type:
    --   customs: 0.95 | crawl_gov: 0.85 | api_partner: 0.85
    --   crawl_news: 0.75 | crawl_ecom: 0.70 | crowdsource: 0.60
    -- Giảm thêm nếu: spike_detected (-0.3), no_bounds_defined (-0.1)

    flags           TEXT[] NOT NULL DEFAULT '{}',
    -- 'spike_detected'     : Biến động >40% so với median 7 ngày
    -- 'no_history'         : Chưa có lịch sử để so sánh spike
    -- 'no_bounds_defined'  : Mặt hàng chưa có price bounds
    -- 'below_minimum'      : Giá thấp hơn bounds (đã reject — xem ingestion)
    -- 'crowdsource_unverified': Crowdsource chưa được xác nhận
    -- 'price_type_inferred': price_type được suy ra từ nguồn, không khai báo rõ

    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE = admin hoặc đối tác xác nhận thủ công
    raw_payload     JSONB NOT NULL DEFAULT '{}'
    -- KHÔNG BAO GIỜ bỏ — lưu raw data gốc để debug
);

-- === INDEX ===
CREATE INDEX idx_po_slug_type_time
    ON price_observations (commodity_slug, price_type, recorded_at DESC);
CREATE INDEX idx_po_province_slug_time
    ON price_observations (province_code, commodity_slug, recorded_at DESC);
CREATE INDEX idx_po_price_type_time
    ON price_observations (price_type, recorded_at DESC);
CREATE INDEX idx_po_source_type_time
    ON price_observations (source_type, recorded_at DESC);
CREATE INDEX idx_po_confidence
    ON price_observations (confidence, recorded_at DESC);
CREATE INDEX idx_po_flags
    ON price_observations USING GIN (flags);

-- === TRIGGER: sync commodity_slug ===
CREATE OR REPLACE FUNCTION sync_commodity_slug()
RETURNS TRIGGER AS $$
BEGIN
    SELECT slug INTO NEW.commodity_slug
    FROM commodities WHERE id = NEW.commodity_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_commodity_slug
    BEFORE INSERT OR UPDATE OF commodity_id
    ON price_observations
    FOR EACH ROW EXECUTE FUNCTION sync_commodity_slug();

-- === CONSTRAINT: validate price_type ===
ALTER TABLE price_observations
    ADD CONSTRAINT chk_price_type
    CHECK (price_type IN ('farm_gate','wholesale','retail','export'));
-- 'world' KHÔNG có ở đây — lưu vào world_prices

-- === CONSTRAINT: export phải có price_usd ===
ALTER TABLE price_observations
    ADD CONSTRAINT chk_export_has_usd
    CHECK (price_type != 'export' OR price_usd IS NOT NULL);
```

### Bảng world_prices — Lớp 5

```sql
-- Giá sàn giao dịch quốc tế — schema riêng biệt hoàn toàn
CREATE TABLE world_prices (
    id              BIGSERIAL PRIMARY KEY,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    commodity_id    INT NOT NULL REFERENCES commodities(id),
    commodity_slug  TEXT NOT NULL,

    -- === THÔNG TIN SÀN ===
    exchange        TEXT NOT NULL,
    -- 'ICE_LIFFE'  : Robusta coffee London
    -- 'ICE_US'     : Arabica coffee New York
    -- 'CBOT'       : Corn, Soybean, Wheat, Rice (Chicago)
    -- 'SGX'        : Rubber Singapore
    -- 'TOCOM'      : Rubber Tokyo
    -- 'FAO'        : FAO Food Price Index (tổng hợp)
    -- 'WB'         : World Bank Commodity Price

    contract_month  TEXT,
    -- Tháng hợp đồng kỳ hạn: 'MAY25', 'JUL25', 'SEP25'
    -- NULL cho giá spot hoặc index

    -- === GIÁ GỐC (đơn vị sàn) ===
    price_raw       NUMERIC(12,4) NOT NULL,
    price_unit_raw  TEXT NOT NULL,
    -- 'USD/MT' | 'USc/lb' | 'USD/bushel' | 'USc/kg' | 'USD/cwt'

    -- === GIÁ ĐÃ QUY ĐỔI ===
    price_usd_kg    NUMERIC(10,6) NOT NULL,
    -- Đã quy về USD/kg theo world_to_kg_factor trong commodities
    price_vnd_kg    NUMERIC(14,2),
    -- Đã quy về VNĐ/kg = price_usd_kg * exchange_rate
    exchange_rate   NUMERIC(10,2),
    -- Tỷ giá tại thời điểm ghi

    -- === BIẾN ĐỘNG ===
    change_1d       NUMERIC(10,4),   -- Thay đổi tuyệt đối so với phiên trước
    change_1d_pct   NUMERIC(6,2),    -- % thay đổi
    change_1w_pct   NUMERIC(6,2),    -- % thay đổi 1 tuần
    volume          BIGINT,          -- Khối lượng giao dịch (lot)
    open_interest   BIGINT,          -- Open interest

    source_url      TEXT,
    raw_payload     JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_wp_slug_exchange_time
    ON world_prices (commodity_slug, exchange, recorded_at DESC);
CREATE INDEX idx_wp_exchange_time
    ON world_prices (exchange, recorded_at DESC);
CREATE INDEX idx_wp_slug_time
    ON world_prices (commodity_slug, recorded_at DESC);
```

### Bảng người dùng (giữ nguyên từ v1, bổ sung nhỏ)

```sql
CREATE TABLE user_profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id),
    display_name    TEXT,
    province_code   VARCHAR(3) REFERENCES provinces(code),
    role            TEXT NOT NULL DEFAULT 'free',
    -- 'free' | 'pro' | 'b2b' | 'admin'
    commodity_follows TEXT[] DEFAULT '{}',
    -- Slug danh sách mặt hàng theo dõi
    price_type_preference TEXT[] DEFAULT '{wholesale,export}',
    -- Lớp giá ưu tiên hiển thị
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE price_alerts (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES user_profiles(id),
    commodity_slug  TEXT NOT NULL,
    province_code   VARCHAR(3),
    price_type      TEXT NOT NULL DEFAULT 'wholesale',
    -- Theo dõi lớp giá nào: 'farm_gate'|'wholesale'|'retail'|'export'|'world'
    condition       TEXT NOT NULL,
    -- 'above' | 'below' | 'change_pct_up' | 'change_pct_down'
    threshold_vnd   NUMERIC(14,2),
    threshold_usd   NUMERIC(10,4),
    threshold_pct   FLOAT,
    channel         TEXT NOT NULL DEFAULT 'zalo',
    -- 'zalo' | 'email' | 'push'
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_triggered  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE crowdsource_submissions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES user_profiles(id),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    commodity_slug  TEXT NOT NULL,
    price_type      TEXT NOT NULL DEFAULT 'farm_gate',
    -- Người dùng khai báo họ đang báo giá lớp nào
    price_raw       TEXT NOT NULL,
    unit_raw        TEXT NOT NULL,
    province_code   VARCHAR(3),
    market_name     TEXT,
    note            TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'accepted' | 'rejected'
    rejection_reason TEXT,
    observation_id  BIGINT REFERENCES price_observations(id)
);
```

---

## ZONE 3 — Curated Zone (Materialized Views)

```sql
-- ⭐ View trung tâm: tổng hợp tất cả lớp giá cho 1 mặt hàng
-- Đây là nguồn dữ liệu cho trang chi tiết mặt hàng và chatbot AI
CREATE MATERIALIZED VIEW price_chain_summary AS
WITH domestic_latest AS (
    -- Lấy giá mới nhất của mỗi lớp (1-4) trong 7 ngày
    SELECT DISTINCT ON (commodity_slug, price_type)
        commodity_slug,
        price_type,
        price_vnd,
        price_usd,
        province_code,
        source_name,
        source_type,
        recorded_at,
        confidence
    FROM price_observations
    WHERE recorded_at >= NOW() - INTERVAL '7 days'
      AND confidence >= 0.5
    ORDER BY commodity_slug, price_type, recorded_at DESC
),
world_latest AS (
    -- Lấy giá thế giới mới nhất theo sàn chính
    SELECT DISTINCT ON (commodity_slug)
        commodity_slug,
        exchange,
        price_usd_kg,
        price_vnd_kg,
        change_1d_pct,
        change_1w_pct,
        recorded_at AS world_updated_at
    FROM world_prices
    WHERE recorded_at >= NOW() - INTERVAL '3 days'
    ORDER BY commodity_slug, recorded_at DESC
)
SELECT
    d.commodity_slug,

    -- Giá từng lớp (VNĐ/kg)
    MAX(CASE WHEN d.price_type = 'farm_gate' THEN d.price_vnd END) AS farm_gate_vnd,
    MAX(CASE WHEN d.price_type = 'wholesale' THEN d.price_vnd END) AS wholesale_vnd,
    MAX(CASE WHEN d.price_type = 'retail'    THEN d.price_vnd END) AS retail_vnd,
    MAX(CASE WHEN d.price_type = 'export'    THEN d.price_vnd END) AS export_vnd,
    MAX(CASE WHEN d.price_type = 'export'    THEN d.price_usd END) AS export_usd,

    -- Giá thế giới
    w.exchange                  AS world_exchange,
    w.price_usd_kg              AS world_usd_kg,
    w.price_vnd_kg              AS world_vnd_kg,
    w.change_1d_pct             AS world_change_1d_pct,
    w.change_1w_pct             AS world_change_1w_pct,
    w.world_updated_at,

    -- Margin chuỗi giá trị (%)
    CASE
        WHEN MAX(CASE WHEN d.price_type = 'farm_gate' THEN d.price_vnd END) > 0
         AND MAX(CASE WHEN d.price_type = 'retail'    THEN d.price_vnd END) > 0
        THEN ROUND(
            (MAX(CASE WHEN d.price_type = 'retail' THEN d.price_vnd END) -
             MAX(CASE WHEN d.price_type = 'farm_gate' THEN d.price_vnd END)) /
             MAX(CASE WHEN d.price_type = 'farm_gate' THEN d.price_vnd END) * 100, 1)
    END AS retail_vs_farmgate_pct,

    CASE
        WHEN MAX(CASE WHEN d.price_type = 'farm_gate' THEN d.price_vnd END) > 0
         AND MAX(CASE WHEN d.price_type = 'export'    THEN d.price_vnd END) > 0
        THEN ROUND(
            (MAX(CASE WHEN d.price_type = 'export' THEN d.price_vnd END) -
             MAX(CASE WHEN d.price_type = 'farm_gate' THEN d.price_vnd END)) /
             MAX(CASE WHEN d.price_type = 'farm_gate' THEN d.price_vnd END) * 100, 1)
    END AS export_vs_farmgate_pct,

    -- Metadata
    MAX(d.recorded_at)          AS domestic_updated_at,
    NOW()                       AS summary_updated_at

FROM domestic_latest d
LEFT JOIN world_latest w ON d.commodity_slug = w.commodity_slug
GROUP BY d.commodity_slug, w.exchange, w.price_usd_kg, w.price_vnd_kg,
         w.change_1d_pct, w.change_1w_pct, w.world_updated_at;

CREATE UNIQUE INDEX ON price_chain_summary (commodity_slug);


-- View bảng giá theo ngày (tất cả lớp)
CREATE MATERIALIZED VIEW daily_price_summary AS
SELECT
    date_trunc('day', recorded_at)  AS date,
    commodity_id,
    commodity_slug,
    price_type,
    province_code,
    source_type,
    AVG(price_vnd)                  AS avg_price_vnd,
    MIN(price_vnd)                  AS min_price_vnd,
    MAX(price_vnd)                  AS max_price_vnd,
    PERCENTILE_CONT(0.5)
        WITHIN GROUP (ORDER BY price_vnd) AS median_price_vnd,
    AVG(price_usd)                  AS avg_price_usd,
    COUNT(*)                        AS observation_count,
    AVG(confidence)                 AS avg_confidence,
    array_agg(DISTINCT source_name) AS sources
FROM price_observations
WHERE confidence >= 0.5
GROUP BY 1,2,3,4,5,6;

CREATE UNIQUE INDEX ON daily_price_summary
    (date, commodity_slug, price_type, province_code, source_type);
CREATE INDEX ON daily_price_summary (commodity_slug, price_type, date DESC);
CREATE INDEX ON daily_price_summary (price_type, date DESC);


-- View bảng giá theo tỉnh (dùng cho bản đồ)
CREATE MATERIALIZED VIEW regional_price_map AS
SELECT
    CURRENT_DATE                    AS date,
    commodity_slug,
    price_type,
    province_code,
    AVG(price_vnd)                  AS avg_price,
    ROUND(
        AVG(price_vnd) / AVG(AVG(price_vnd))
            OVER (PARTITION BY commodity_slug, price_type) * 100
    , 1)                            AS vs_national_avg_pct,
    COUNT(*)                        AS data_points,
    MAX(recorded_at)                AS latest_record
FROM price_observations
WHERE recorded_at >= NOW() - INTERVAL '3 days'
  AND confidence >= 0.5
  AND province_code IS NOT NULL
GROUP BY commodity_slug, price_type, province_code;

CREATE INDEX ON regional_price_map (commodity_slug, price_type);
CREATE INDEX ON regional_price_map (province_code);


-- View xu hướng giá (dùng cho chatbot và trang phân tích)
CREATE MATERIALIZED VIEW commodity_trends AS
WITH calc AS (
    SELECT
        commodity_slug,
        price_type,
        AVG(CASE WHEN recorded_at >= NOW() - INTERVAL '7 days'
                 THEN price_vnd END)        AS avg_7d,
        AVG(CASE WHEN recorded_at >= NOW() - INTERVAL '14 days'
                 AND recorded_at < NOW() - INTERVAL '7 days'
                 THEN price_vnd END)        AS avg_prev_7d,
        AVG(CASE WHEN recorded_at >= NOW() - INTERVAL '30 days'
                 THEN price_vnd END)        AS avg_30d,
        AVG(CASE WHEN recorded_at >= NOW() - INTERVAL '60 days'
                 AND recorded_at < NOW() - INTERVAL '30 days'
                 THEN price_vnd END)        AS avg_prev_30d,
        STDDEV(CASE WHEN recorded_at >= NOW() - INTERVAL '30 days'
                    THEN price_vnd END)     AS stddev_30d,
        COUNT(*)                            AS total_obs
    FROM price_observations
    WHERE recorded_at >= NOW() - INTERVAL '60 days'
      AND confidence >= 0.5
    GROUP BY commodity_slug, price_type
)
SELECT
    commodity_slug,
    price_type,
    avg_7d,
    avg_30d,
    CASE WHEN avg_prev_7d  > 0
         THEN ROUND(((avg_7d  - avg_prev_7d)  / avg_prev_7d  * 100)::NUMERIC, 2)
    END AS trend_7d_pct,
    CASE WHEN avg_prev_30d > 0
         THEN ROUND(((avg_30d - avg_prev_30d) / avg_prev_30d * 100)::NUMERIC, 2)
    END AS trend_30d_pct,
    CASE WHEN avg_30d > 0
         THEN ROUND((stddev_30d / avg_30d * 100)::NUMERIC, 2)
    END AS volatility_pct,
    total_obs,
    NOW() AS updated_at
FROM calc;

CREATE UNIQUE INDEX ON commodity_trends (commodity_slug, price_type);


-- View lịch sử tuần (cho chart dài hạn)
CREATE MATERIALIZED VIEW weekly_price_history AS
SELECT
    date_trunc('week', recorded_at) AS week,
    commodity_slug,
    price_type,
    province_code,
    AVG(price_vnd)                  AS avg_price,
    MIN(price_vnd)                  AS min_price,
    MAX(price_vnd)                  AS max_price,
    PERCENTILE_CONT(0.5)
        WITHIN GROUP (ORDER BY price_vnd) AS median_price,
    COUNT(*)                        AS observation_count
FROM price_observations
WHERE confidence >= 0.5
GROUP BY 1,2,3,4;

CREATE INDEX ON weekly_price_history (commodity_slug, price_type, week DESC);
```

### Lịch refresh

```sql
-- Bật pg_cron: Dashboard → Extensions → enable pg_cron

SELECT cron.schedule('refresh-price-chain',    '*/30 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY price_chain_summary');

SELECT cron.schedule('refresh-daily-price',    '*/30 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY daily_price_summary');

SELECT cron.schedule('refresh-regional-map',   '0 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY regional_price_map');

SELECT cron.schedule('refresh-trends',         '5 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY commodity_trends');

SELECT cron.schedule('refresh-weekly-history', '0 1 * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY weekly_price_history');
```

---

## Stored Functions

```sql
-- Median 7 ngày theo price_type — dùng cho spike detection
CREATE OR REPLACE FUNCTION get_recent_median(
    p_commodity_id  INT,
    p_province_code TEXT,
    p_price_type    TEXT DEFAULT 'wholesale',
    p_days          INT  DEFAULT 7
)
RETURNS TABLE(median_price NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT PERCENTILE_CONT(0.5)
               WITHIN GROUP (ORDER BY price_vnd)::NUMERIC
    FROM price_observations
    WHERE commodity_id  = p_commodity_id
      AND (province_code = p_province_code OR province_code IS NULL)
      AND price_type    = p_price_type
      AND recorded_at  >= NOW() - (p_days || ' days')::INTERVAL
      AND confidence   >= 0.5;
END;
$$ LANGUAGE plpgsql;


-- Lấy context giá cho chatbot AI — trả về tóm tắt đủ 5 lớp
CREATE OR REPLACE FUNCTION get_price_context_for_ai(
    p_commodity_slug TEXT,
    p_province_code  TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'commodity',        p_commodity_slug,
        'province',         p_province_code,
        'farm_gate_vnd',    pcs.farm_gate_vnd,
        'wholesale_vnd',    pcs.wholesale_vnd,
        'retail_vnd',       pcs.retail_vnd,
        'export_vnd',       pcs.export_vnd,
        'export_usd',       pcs.export_usd,
        'world_exchange',   pcs.world_exchange,
        'world_usd_kg',     pcs.world_usd_kg,
        'world_change_pct', pcs.world_change_1d_pct,
        'retail_vs_farmgate_pct', pcs.retail_vs_farmgate_pct,
        'trend_7d_pct',     ct.trend_7d_pct,
        'volatility_pct',   ct.volatility_pct,
        'updated_at',       pcs.domestic_updated_at
    ) INTO result
    FROM price_chain_summary pcs
    LEFT JOIN commodity_trends ct
           ON ct.commodity_slug = pcs.commodity_slug
          AND ct.price_type = 'wholesale'
    WHERE pcs.commodity_slug = p_commodity_slug;

    RETURN result;
END;
$$ LANGUAGE plpgsql;


-- Đếm records mỗi giờ — health check
CREATE OR REPLACE FUNCTION count_records_last_hour()
RETURNS TABLE(count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT COUNT(*) FROM price_observations
    WHERE recorded_at >= NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
```

---

## Row Level Security

```sql
ALTER TABLE price_observations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_prices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowdsource_submissions ENABLE ROW LEVEL SECURITY;

-- price_observations: public đọc data đủ tin cậy
CREATE POLICY "public read domestic prices"
    ON price_observations FOR SELECT
    USING (confidence >= 0.5);

-- world_prices: public đọc tất cả
CREATE POLICY "public read world prices"
    ON world_prices FOR SELECT USING (TRUE);

-- Insert chỉ service_role (crawler dùng service key)
CREATE POLICY "service write domestic prices"
    ON price_observations FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service write world prices"
    ON world_prices FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- User chỉ đọc/sửa dữ liệu của mình
CREATE POLICY "users own profile"
    ON user_profiles USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "users own alerts"
    ON price_alerts USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users own submissions"
    ON crowdsource_submissions USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
```

---

## Thứ tự migration (bắt buộc)

```
Bước 1  → commodities (không có FK)
Bước 2  → provinces (không có FK)
Bước 3  → price_observations (FK → commodities, provinces)
Bước 4  → world_prices (FK → commodities)
Bước 5  → weather_cache (FK → provinces)
Bước 6  → user_profiles (FK → auth.users, provinces)
Bước 7  → price_alerts (FK → user_profiles)
Bước 8  → crowdsource_submissions (FK → user_profiles, price_observations)
Bước 9  → raw_crawl_logs (không có FK)
Bước 10 → ingestion_errors (không có FK)
Bước 11 → Stored functions (phụ thuộc bảng)
Bước 12 → Trigger trg_sync_commodity_slug
Bước 13 → Constraints (chk_price_type, chk_export_has_usd)
Bước 14 → Materialized views (phụ thuộc tất cả bảng)
           Thứ tự: daily_price_summary → price_chain_summary
                   → regional_price_map → commodity_trends → weekly_price_history
Bước 15 → RLS policies
Bước 16 → pg_cron schedules
Bước 17 → Seed data (commodities, provinces)
```

---

## API Query Examples (Next.js Server Component)

```typescript
// 1. Trang chi tiết mặt hàng — tất cả lớp giá
const { data: chain } = await supabase
  .from('price_chain_summary')
  .select('*')
  .eq('commodity_slug', 'ca-phe')
  .single()

// 2. Bảng giá theo tỉnh và lớp giá
const { data: byProvince } = await supabase
  .from('daily_price_summary')
  .select('province_code, price_type, avg_price_vnd, median_price_vnd, sources')
  .eq('commodity_slug', 'sau-rieng')
  .eq('date', today)
  .in('price_type', ['farm_gate', 'wholesale'])
  .order('avg_price_vnd', { ascending: false })

// 3. Context cho chatbot AI
const { data: context } = await supabase
  .rpc('get_price_context_for_ai', {
    p_commodity_slug: 'sau-rieng',
    p_province_code: '66'  // Đắk Lắk
  })

// 4. Bản đồ giá theo tỉnh
const { data: map } = await supabase
  .from('regional_price_map')
  .select('province_code, avg_price, vs_national_avg_pct')
  .eq('commodity_slug', 'ca-phe')
  .eq('price_type', 'wholesale')
  .order('avg_price', { ascending: false })

// 5. Giá thế giới
const { data: world } = await supabase
  .from('world_prices')
  .select('exchange, price_usd_kg, price_vnd_kg, change_1d_pct, recorded_at')
  .eq('commodity_slug', 'ca-phe')
  .order('recorded_at', { ascending: false })
  .limit(5)

// 6. Lịch sử giá cho chart (tất cả lớp)
const { data: history } = await supabase
  .from('weekly_price_history')
  .select('week, price_type, median_price, avg_price')
  .eq('commodity_slug', 'tom-the')
  .in('price_type', ['farm_gate', 'wholesale', 'export'])
  .gte('week', thirtyDaysAgo)
  .order('week', { ascending: true })
```

---

## Mapping nguồn → price_type

```
Khi ingestion worker nhận message, xác định price_type như sau:

source_type = 'crawl_news':
  vietnambiz, nongnghiep.vn, giacaphe.com  → price_type = 'wholesale' (mặc định)
  Nếu article_title chứa "xuất khẩu", "FOB" → price_type = 'export'
  Nếu article_title chứa "bán lẻ", "siêu thị" → price_type = 'retail'

source_type = 'crawl_ecom':
  Shopee, Lazada, Tiki, Bách Hoá Xanh → price_type = 'retail'

source_type = 'crawl_gov':
  agro.gov.vn, moit.gov.vn → price_type = 'wholesale'
  Sở NN&PTNT tỉnh → price_type = 'wholesale' hoặc 'farm_gate'

source_type = 'customs':
  customs.gov.vn → price_type = 'export' (bắt buộc có price_usd)

source_type = 'crowdsource':
  Người dùng tự khai báo → dùng giá trị từ form (farm_gate mặc định)
  → thêm flag 'crowdsource_unverified' nếu chưa xác minh

source_type = 'api_partner':
  VASEP → price_type = 'export'
  VPA (Hồ tiêu), VICOFA (Cà phê) → price_type = 'wholesale' hoặc 'export'
```

---

## Lưu ý quan trọng cho AI coding assistant

```
1. price_type 'world' KHÔNG tồn tại trong price_observations
   → Lớp 5 (giá thế giới) chỉ lưu trong world_prices
   → Constraint chk_price_type sẽ reject nếu nhầm

2. price_chain_summary là VIEW CHÍNH cho API
   → Không query thẳng price_observations hoặc world_prices trong API trang chủ
   → Chỉ query thẳng price_observations khi: admin dashboard, ingestion, debug

3. export phải có price_usd — enforce bởi constraint chk_export_has_usd
   → Ingestion worker phải tính price_usd trước khi insert export records

4. get_price_context_for_ai() trả về JSON đầy đủ 5 lớp
   → Inject vào system prompt của Gemini khi user hỏi về giá
   → Không hardcode giá trong prompt

5. Khi thêm mặt hàng mới:
   → INSERT vào commodities (điền world_exchange, world_to_kg_factor nếu có)
   → Thêm vào COMMODITY_MAP trong normalizer.py
   → Thêm vào PRICE_BOUNDS trong validators.py
   → Thêm vào HS_TO_SLUG trong customs_crawler.py

6. Crawler nhận source_type, không phải source
   → source_type = loại kênh ('crawl_news', 'customs'...)
   → source_name = tên cụ thể ('vietnambiz', 'shopee'...)
   → Cả hai đều lưu vào price_observations

7. crowdsource_submissions không insert thẳng vào price_observations
   → Sau validate mới tạo observation và link qua observation_id
   → Confidence crowdsource mặc định = 0.60, thêm flag 'crowdsource_unverified'

8. Materialized view dùng CONCURRENTLY khi refresh
   → Yêu cầu UNIQUE INDEX trên mỗi view
   → Đã tạo sẵn trong schema — không xóa

9. confidence >= 0.5 là filter mặc định cho mọi query public
   → Không filter confidence trong query admin/debug
   → Không thay đổi threshold này mà không cập nhật tất cả views
```