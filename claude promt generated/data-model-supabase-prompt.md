# Data Model — AgriData VN trên Supabase
> Prompt cho AI coding assistant. Đọc toàn bộ file này trước khi viết bất kỳ dòng SQL hoặc code nào.

---

## Bối cảnh hệ thống

Nền tảng dữ liệu giá nông sản Việt Nam. Thu thập giá từ nhiều nguồn (crawler, crowdsource, hải quan), chuẩn hóa, validate, lưu vào Supabase, phục vụ API cho frontend Next.js và chatbot AI.

**Yêu cầu cốt lõi data model phải trả lời được:**
- Giá [nông sản] tại [tỉnh] hôm nay là bao nhiêu?
- Giá trung bình / min / max / median theo ngày, tuần, tháng?
- Vùng nào giá cao nhất / thấp nhất tuần này?
- Giá đang tăng hay giảm so với 7 ngày trước?
- Nguồn nào cung cấp dữ liệu tin cậy nhất?
- Giá thế giới [mặt hàng] hôm nay là bao nhiêu?

---

## Kiến trúc 3 Zone

```
Zone 1 — Raw Zone       : Lưu nguyên bản data gốc, không sửa, để trace/debug
Zone 2 — Cleaned Zone   : Bảng chính đã validate + chuẩn hóa, API đọc từ đây
Zone 3 — Curated Zone   : Materialized views tổng hợp, pre-compute, query nhanh
```

---

## Nguyên tắc thiết kế — đọc kỹ trước khi viết SQL

```
1. Tên nông sản KHÔNG lưu text thẳng → dùng bảng commodities + FK commodity_id
   Lý do: "Sầu riêng", "sau rieng", "SR Monthong" là cùng 1 mặt hàng
           Lưu text thẳng → aggregate sai hoàn toàn

2. Giá LUÔN quy về VNĐ/kg trong price_observations.price_vnd
   Lý do: nguồn báo tấn/tạ/yến → normalize khi ingestion
           Giữ nguyên đơn vị → AVG() vô nghĩa

3. Data kém tin cậy KHÔNG reject → lưu + đánh confidence thấp
   Lý do: crowdsource sai 10-20% nhưng vẫn cho biết xu hướng
           API public filter confidence >= 0.7
           Dashboard internal thấy tất cả >= 0.1

4. Spike bất thường KHÔNG reject → lưu + flag + giảm confidence
   Lý do: spike có thể là thật (thiên tai, sự kiện thị trường)

5. LUÔN lưu raw_payload JSONB cho mọi bản ghi price_observations
   Lý do: khi parser sai hoặc crawler lỗi cần nhìn lại data gốc
           Không có raw → mất data không thể recover

6. Flag dùng TEXT[] array, không dùng nhiều cột boolean
   Lý do: flag mới có thể xuất hiện bất kỳ lúc nào
           Array linh hoạt, không cần ALTER TABLE

7. Materialized view refresh 30 phút, KHÔNG query thẳng price_observations
   Lý do: bảng chính sẽ có hàng triệu rows sau vài tháng
           Query aggregate trực tiếp → 3-8 giây mỗi request
           Từ materialized view → < 50ms
```

---

## ZONE 1 — Raw Zone

```sql
-- Lưu snapshot HTML/JSON thô từ mỗi lần crawl
-- Không bao giờ sửa bảng này sau khi insert
CREATE TABLE raw_crawl_logs (
    id          BIGSERIAL PRIMARY KEY,
    source      TEXT NOT NULL,        -- 'agro_gov' | 'nongnghiep_vn' | 'shopee'
    source_url  TEXT,
    html_snapshot TEXT,               -- HTML gốc của trang (nullable nếu quá lớn)
    raw_json    JSONB,                -- Data đã parse sơ bộ từ crawler
    crawled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lưu mọi record bị reject trong ingestion để review thủ công
CREATE TABLE ingestion_errors (
    id          BIGSERIAL PRIMARY KEY,
    failed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source      TEXT,
    error_type  TEXT NOT NULL,
    -- error_type nhận các giá trị:
    -- 'schema_invalid'      : thiếu field bắt buộc hoặc sai kiểu dữ liệu
    -- 'unknown_commodity'   : tên nông sản không map được trong COMMODITY_MAP
    -- 'unparseable_price'   : không parse ra số từ chuỗi giá
    -- 'unconvertible_unit'  : đơn vị không convert về kg được (vd: "trái", "thùng")
    -- 'below_minimum'       : giá thấp hơn bounds tối thiểu
    -- 'above_maximum'       : giá cao hơn bounds tối đa
    -- 'stale_data'          : data cũ hơn 48 giờ
    -- 'duplicate'           : bản ghi trùng lặp trong 6 giờ
    reason      TEXT,
    raw_payload JSONB                 -- Toàn bộ message gốc để debug
);

-- Index để query lỗi nhanh khi debug
CREATE INDEX ON ingestion_errors (error_type, failed_at DESC);
CREATE INDEX ON ingestion_errors (source, failed_at DESC);
```

---

## ZONE 2 — Cleaned Zone (Bảng chính)

### Bảng lookup — tạo trước, các bảng khác FK vào đây

```sql
-- Danh mục nông sản chuẩn hóa
-- Đây là bảng lookup — mọi variant tên đều map về 1 row ở đây
CREATE TABLE commodities (
    id           SERIAL PRIMARY KEY,
    name_vi      TEXT NOT NULL,           -- Tên tiếng Việt chuẩn: 'Sầu riêng'
    name_en      TEXT,                    -- 'Durian'
    slug         TEXT UNIQUE NOT NULL,    -- 'sau-rieng' — dùng trong URL và API
    hs_code      VARCHAR(10),             -- Mã HS hải quan: '0810.60'
    category     TEXT NOT NULL,
    -- category nhận các giá trị:
    -- 'fruit' | 'rice' | 'coffee' | 'vegetable' | 'seafood' | 'spice' | 'nut'
    unit_default TEXT NOT NULL DEFAULT 'kg',
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed dữ liệu ban đầu — chạy ngay sau khi tạo bảng
INSERT INTO commodities (name_vi, name_en, slug, hs_code, category) VALUES
    ('Sầu riêng',   'Durian',       'sau-rieng',   '0810.60', 'fruit'),
    ('Cà phê',      'Coffee',       'ca-phe',       '0901.11', 'coffee'),
    ('Lúa gạo',     'Rice',         'lua-gao',      '1006.10', 'rice'),
    ('Gạo xuất khẩu','Export Rice', 'gao-xuat-khau','1006.30', 'rice'),
    ('Tôm thẻ',     'Whiteleg Shrimp','tom-the',    '0306.17', 'seafood'),
    ('Tôm sú',      'Black Tiger',  'tom-su',       '0306.16', 'seafood'),
    ('Cá tra',      'Pangasius',    'ca-tra',       '0302.73', 'seafood'),
    ('Hồ tiêu',     'Black Pepper', 'tieu',         '0904.11', 'spice'),
    ('Điều',        'Cashew',       'dieu',         '0801.31', 'nut'),
    ('Mít Thái',    'Jackfruit',    'mit-thai',     '0810.90', 'fruit'),
    ('Thanh long',  'Dragon Fruit', 'thanh-long',   '0810.90', 'fruit'),
    ('Dưa hấu',     'Watermelon',   'dua-hau',      '0807.11', 'fruit'),
    ('Cao su',      'Rubber',       'cao-su',       '4001.10', 'other'),
    ('Mía đường',   'Sugarcane',    'mia-duong',    '1701.14', 'other');


-- Danh mục tỉnh thành chuẩn theo mã GSO
CREATE TABLE provinces (
    code        VARCHAR(3) PRIMARY KEY,   -- Mã GSO: '66', '82', '92'
    name_vi     TEXT NOT NULL,            -- 'Đắk Lắk'
    name_en     TEXT,                     -- 'Dak Lak'
    region      TEXT NOT NULL,
    -- region nhận các giá trị:
    -- 'north' | 'central' | 'south' | 'highland'
    lat         FLOAT,                    -- Tọa độ trung tâm tỉnh
    lng         FLOAT,
    is_major_agri BOOLEAN DEFAULT FALSE   -- TRUE = tỉnh sản xuất nông sản lớn
);

-- Seed 63 tỉnh thành (các tỉnh nông nghiệp chính)
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
    ('77', 'Bà Rịa - Vũng Tàu', 'south', 10.5417, 107.2429, FALSE),
    ('75', 'Đồng Nai',   'south',    11.0686, 107.1676, TRUE),
    ('74', 'Bình Dương', 'south',    11.3254, 106.4770, FALSE),
    ('72', 'Tây Ninh',   'south',    11.3352, 106.1099, TRUE),
    ('80', 'Long An',    'south',    10.5354, 106.4102, TRUE),
    ('86', 'Vĩnh Long',  'south',    10.2538, 105.9722, TRUE),
    ('84', 'Trà Vinh',   'south',    9.9477,  106.3419, TRUE),
    ('94', 'Sóc Trăng',  'south',    9.6025,  105.9739, TRUE),
    ('93', 'Hậu Giang',  'south',    9.7832,  105.4703, TRUE);
    -- Bổ sung 43 tỉnh còn lại theo chuẩn GSO


-- Cache thời tiết theo tỉnh
-- Không lưu lịch sử — chỉ lưu snapshot mới nhất
CREATE TABLE weather_cache (
    province_code   VARCHAR(3) PRIMARY KEY REFERENCES provinces(code),
    payload         JSONB NOT NULL,    -- Response đầy đủ từ Open-Meteo
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL
    -- expires_at = fetched_at + 3 hours
    -- Worker kiểm tra expires_at trước khi gọi API
);
```

### Bảng trung tâm — price_observations

```sql
-- ⭐ Bảng quan trọng nhất — mọi logic đều xoay quanh bảng này
-- Mỗi row = 1 lần quan sát giá tại 1 thời điểm, 1 địa điểm, 1 nguồn
CREATE TABLE price_observations (
    id              BIGSERIAL PRIMARY KEY,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- === ĐỊNH DANH NÔNG SẢN ===
    commodity_id    INT NOT NULL REFERENCES commodities(id),
    commodity_slug  TEXT NOT NULL,
    -- Denormalize slug để tránh JOIN trong query thường xuyên
    -- Phải đồng bộ với commodities.slug — enforce bằng trigger
    variety         TEXT,           -- Giống cụ thể: 'Monthong', 'Ri6', 'IR504'
    quality_grade   TEXT,           -- 'loại 1' | 'loại 2' | 'xuất khẩu'

    -- === ĐỊNH DANH ĐỊA LÝ ===
    province_code   VARCHAR(3) REFERENCES provinces(code),
    -- NULL = không xác định được tỉnh (vd: giá quốc gia tổng hợp)
    market_type     TEXT NOT NULL DEFAULT 'wholesale',
    -- 'farm_gate' : Giá tại ruộng/vườn — thấp nhất
    -- 'wholesale'  : Giá chợ đầu mối — phổ biến nhất
    -- 'retail'     : Giá bán lẻ — cao nhất
    -- 'export'     : Giá xuất khẩu FOB/CIF

    -- === GIÁ (luôn quy về VNĐ/kg) ===
    price_vnd       NUMERIC(12,2) NOT NULL,
    -- LUÔN là VNĐ/kg dù nguồn báo đơn vị khác
    -- Normalizer chịu trách nhiệm convert trước khi insert
    unit            TEXT NOT NULL DEFAULT 'kg',
    -- Đơn vị sau khi normalize — thường là 'kg'
    -- Lưu để biết conversion đã xảy ra như thế nào
    price_usd       NUMERIC(10,4),
    -- Quy đổi tự động khi insert — dùng exchange rate ngày hôm đó
    -- Nullable: không phải lúc nào cũng cần

    -- === METADATA NGUỒN ===
    source          TEXT NOT NULL,
    -- 'agro_gov'       : agro.gov.vn — confidence base 0.85
    -- 'nongnghiep_vn'  : nongnghiep.vn — confidence base 0.75
    -- 'shopee'         : TMĐT — confidence base 0.70
    -- 'customs_gov'    : Hải quan — confidence base 0.95
    -- 'crowdsource'    : Người dùng nhập — confidence base 0.60
    source_url      TEXT,

    -- === CHẤT LƯỢNG DỮ LIỆU ===
    confidence      FLOAT NOT NULL DEFAULT 0.7
                    CHECK (confidence >= 0.0 AND confidence <= 1.0),
    -- 0.0–1.0: càng cao càng tin cậy
    -- API public chỉ dùng records >= 0.7
    -- Dashboard internal dùng >= 0.1
    -- Tính = base_confidence(source) - sum(penalties từ validators)

    flags           TEXT[] NOT NULL DEFAULT '{}',
    -- Mảng rỗng = không có vấn đề gì
    -- Các flag có thể xuất hiện:
    -- 'spike_detected'    : biến động > 40% so với median 7 ngày
    -- 'no_history'        : chưa có lịch sử để so sánh spike
    -- 'no_bounds_defined' : mặt hàng chưa có price bounds
    -- 'low_confidence'    : confidence < 0.5 sau khi tính

    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE = đã được admin xác nhận thủ công
    -- Dùng cho records có spike_detected quan trọng

    -- === RAW DATA GỐC ===
    raw_payload     JSONB NOT NULL DEFAULT '{}'
    -- KHÔNG BAO GIỜ bỏ cột này
    -- Lưu toàn bộ data gốc trước khi normalize
    -- Dùng để debug khi parser sai hoặc crawler lỗi
);

-- === INDEX — quan trọng, thiếu thì query rất chậm ===
-- Index cho query thường xuyên nhất: giá theo mặt hàng + thời gian
CREATE INDEX idx_price_commodity_time
    ON price_observations (commodity_id, recorded_at DESC);

-- Index cho query theo tỉnh
CREATE INDEX idx_price_province_time
    ON price_observations (province_code, recorded_at DESC);

-- Index cho query theo slug (dùng trong API)
CREATE INDEX idx_price_slug_time
    ON price_observations (commodity_slug, recorded_at DESC);

-- Index cho filter theo confidence (API public)
CREATE INDEX idx_price_confidence
    ON price_observations (confidence, recorded_at DESC);

-- Index cho query flags (tìm spike, tìm unverified)
CREATE INDEX idx_price_flags
    ON price_observations USING GIN (flags);

-- Trigger đảm bảo commodity_slug đồng bộ với commodity_id
CREATE OR REPLACE FUNCTION sync_commodity_slug()
RETURNS TRIGGER AS $$
BEGIN
    SELECT slug INTO NEW.commodity_slug
    FROM commodities WHERE id = NEW.commodity_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_slug
    BEFORE INSERT OR UPDATE OF commodity_id
    ON price_observations
    FOR EACH ROW EXECUTE FUNCTION sync_commodity_slug();
```

### Bảng giá thế giới

```sql
-- Giá nông sản thế giới — tách riêng vì cấu trúc khác
-- Nguồn: CBOT, ICE, SGX, FAO, World Bank commodity API
CREATE TABLE world_prices (
    id              BIGSERIAL PRIMARY KEY,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    commodity_id    INT NOT NULL REFERENCES commodities(id),
    commodity_slug  TEXT NOT NULL,
    exchange        TEXT NOT NULL,
    -- 'CBOT'   : Chicago Board of Trade (ngô, đậu tương, lúa mì)
    -- 'ICE'    : ICE Futures (cà phê robusta, cacao)
    -- 'SGX'    : Singapore Exchange (cao su)
    -- 'TOCOM'  : Tokyo (cao su)
    -- 'FAO'    : FAO Food Price Index
    -- 'WB'     : World Bank Commodity Price
    price_usd       NUMERIC(12,4) NOT NULL,  -- Giá USD theo đơn vị gốc
    price_unit      TEXT NOT NULL,            -- 'per MT' | 'per bushel' | 'per lb'
    price_vnd_kg    NUMERIC(12,2),            -- Quy đổi về VNĐ/kg
    source_url      TEXT,
    raw_payload     JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX ON world_prices (commodity_slug, recorded_at DESC);
```

### Bảng người dùng và crowdsource

```sql
-- Profile người dùng — extend Supabase Auth
CREATE TABLE user_profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id),
    display_name    TEXT,
    province_code   VARCHAR(3) REFERENCES provinces(code),
    -- Tỉnh mặc định của người dùng → personalize giá hiển thị
    role            TEXT NOT NULL DEFAULT 'free',
    -- 'free' | 'pro' | 'b2b' | 'admin'
    commodity_follows TEXT[] DEFAULT '{}',
    -- Danh sách slug mặt hàng quan tâm → dùng cho alert
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alert giá người dùng đặt
CREATE TABLE price_alerts (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES user_profiles(id),
    commodity_slug  TEXT NOT NULL,
    province_code   VARCHAR(3),
    condition       TEXT NOT NULL,   -- 'above' | 'below' | 'change_pct'
    threshold_vnd   NUMERIC(12,2),
    threshold_pct   FLOAT,
    channel         TEXT NOT NULL DEFAULT 'zalo',  -- 'zalo' | 'email'
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_triggered  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Giá do người dùng tự nhập (crowdsource)
-- Record này được đẩy vào queue ingestion như mọi nguồn khác
-- Sau khi validate xong → insert vào price_observations với source='crowdsource'
CREATE TABLE crowdsource_submissions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES user_profiles(id),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    commodity_slug  TEXT NOT NULL,
    price_raw       TEXT NOT NULL,    -- Giá người dùng nhập: "85k", "85,000"
    unit_raw        TEXT NOT NULL,    -- Đơn vị: "kg", "tấn"
    province_code   VARCHAR(3),
    market_type     TEXT,
    note            TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    -- 'pending'  : chờ xử lý
    -- 'accepted' : đã insert vào price_observations
    -- 'rejected' : bị reject bởi validator (lý do trong rejection_reason)
    rejection_reason TEXT,
    observation_id  BIGINT REFERENCES price_observations(id)
    -- Link đến bản ghi đã tạo nếu accepted
);
```

---

## ZONE 3 — Curated Zone (Materialized Views)

```sql
-- ⭐ View này là nguồn chính cho API bảng giá
-- Refresh mỗi 30 phút — đủ nhanh cho use case hiển thị giá
CREATE MATERIALIZED VIEW daily_price_summary AS
SELECT
    date_trunc('day', recorded_at)  AS date,
    commodity_id,
    commodity_slug,
    province_code,
    market_type,
    AVG(price_vnd)                  AS avg_price,
    MIN(price_vnd)                  AS min_price,
    MAX(price_vnd)                  AS max_price,
    PERCENTILE_CONT(0.5)
        WITHIN GROUP (ORDER BY price_vnd) AS median_price,
    COUNT(*)                        AS observation_count,
    AVG(confidence)                 AS avg_confidence,
    -- Chỉ lấy records đủ tin cậy
    array_agg(DISTINCT source)      AS sources
FROM price_observations
WHERE confidence >= 0.5
GROUP BY 1,2,3,4,5;

CREATE UNIQUE INDEX ON daily_price_summary
    (date, commodity_slug, province_code, market_type);
CREATE INDEX ON daily_price_summary (commodity_slug, date DESC);
CREATE INDEX ON daily_price_summary (province_code, date DESC);


-- Bản đồ giá theo tỉnh — dùng cho trang bản đồ
CREATE MATERIALIZED VIEW regional_price_map AS
SELECT
    CURRENT_DATE                            AS date,
    commodity_slug,
    province_code,
    AVG(price_vnd)                          AS avg_price,
    -- So sánh với giá trung bình toàn quốc
    AVG(price_vnd) / AVG(AVG(price_vnd))
        OVER (PARTITION BY commodity_slug)  AS vs_national_avg,
    COUNT(*)                                AS data_points
FROM price_observations
WHERE recorded_at >= NOW() - INTERVAL '3 days'
  AND confidence >= 0.5
  AND province_code IS NOT NULL
GROUP BY commodity_slug, province_code;

CREATE INDEX ON regional_price_map (commodity_slug);


-- Xu hướng giá — dùng cho chatbot AI và trang phân tích
CREATE MATERIALIZED VIEW commodity_trends AS
WITH recent AS (
    SELECT
        commodity_slug,
        AVG(CASE WHEN recorded_at >= NOW() - INTERVAL '7 days'
                 THEN price_vnd END)    AS avg_7d,
        AVG(CASE WHEN recorded_at >= NOW() - INTERVAL '14 days'
                 AND recorded_at <  NOW() - INTERVAL '7 days'
                 THEN price_vnd END)    AS avg_prev_7d,
        AVG(CASE WHEN recorded_at >= NOW() - INTERVAL '30 days'
                 THEN price_vnd END)    AS avg_30d,
        AVG(CASE WHEN recorded_at >= NOW() - INTERVAL '60 days'
                 AND recorded_at <  NOW() - INTERVAL '30 days'
                 THEN price_vnd END)    AS avg_prev_30d,
        STDDEV(price_vnd)               AS price_stddev,
        COUNT(*)                        AS total_observations
    FROM price_observations
    WHERE recorded_at >= NOW() - INTERVAL '60 days'
      AND confidence >= 0.5
    GROUP BY commodity_slug
)
SELECT
    commodity_slug,
    avg_7d,
    avg_30d,
    -- trend_7d: % thay đổi so với 7 ngày trước
    CASE WHEN avg_prev_7d > 0
         THEN ROUND(((avg_7d - avg_prev_7d) / avg_prev_7d * 100)::NUMERIC, 2)
         ELSE NULL END                  AS trend_7d_pct,
    -- trend_30d: % thay đổi so với 30 ngày trước
    CASE WHEN avg_prev_30d > 0
         THEN ROUND(((avg_30d - avg_prev_30d) / avg_prev_30d * 100)::NUMERIC, 2)
         ELSE NULL END                  AS trend_30d_pct,
    -- volatility: độ biến động (CV = stddev/mean)
    CASE WHEN avg_30d > 0
         THEN ROUND((price_stddev / avg_30d * 100)::NUMERIC, 2)
         ELSE NULL END                  AS volatility_pct,
    total_observations,
    NOW()                               AS updated_at
FROM recent;

CREATE UNIQUE INDEX ON commodity_trends (commodity_slug);


-- Lịch sử giá theo tuần — dùng cho chart lịch sử dài hạn
CREATE MATERIALIZED VIEW weekly_price_history AS
SELECT
    date_trunc('week', recorded_at)     AS week,
    commodity_slug,
    province_code,
    AVG(price_vnd)                      AS avg_price,
    MIN(price_vnd)                      AS min_price,
    MAX(price_vnd)                      AS max_price,
    PERCENTILE_CONT(0.5)
        WITHIN GROUP (ORDER BY price_vnd) AS median_price,
    COUNT(*)                            AS observation_count
FROM price_observations
WHERE confidence >= 0.5
GROUP BY 1,2,3;

CREATE INDEX ON weekly_price_history (commodity_slug, week DESC);
CREATE INDEX ON weekly_price_history (province_code, week DESC);
```

### Lịch refresh Materialized Views

```sql
-- Setup pg_cron trên Supabase (Dashboard → Extensions → enable pg_cron)

-- daily_price_summary: refresh mỗi 30 phút
SELECT cron.schedule(
    'refresh-daily-price-summary',
    '*/30 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY daily_price_summary'
);

-- regional_price_map: refresh mỗi giờ
SELECT cron.schedule(
    'refresh-regional-price-map',
    '0 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY regional_price_map'
);

-- commodity_trends: refresh mỗi giờ
SELECT cron.schedule(
    'refresh-commodity-trends',
    '5 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY commodity_trends'
);

-- weekly_price_history: refresh mỗi ngày lúc 1h sáng
SELECT cron.schedule(
    'refresh-weekly-history',
    '0 1 * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY weekly_price_history'
);
```

---

## Stored Functions (dùng trong Ingestion Pipeline)

```sql
-- Lấy median giá N ngày gần nhất — dùng cho spike detection
CREATE OR REPLACE FUNCTION get_recent_median(
    p_commodity_id  INT,
    p_province_code TEXT,
    p_days          INT DEFAULT 7
)
RETURNS TABLE(median_price NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT PERCENTILE_CONT(0.5)
               WITHIN GROUP (ORDER BY price_vnd)::NUMERIC
    FROM price_observations
    WHERE commodity_id  = p_commodity_id
      AND province_code = p_province_code
      AND recorded_at  >= NOW() - (p_days || ' days')::INTERVAL
      AND confidence   >= 0.5;
END;
$$ LANGUAGE plpgsql;


-- Đếm records trong N giờ gần nhất — dùng cho health check
CREATE OR REPLACE FUNCTION count_records_last_hour()
RETURNS TABLE(count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT COUNT(*)
    FROM price_observations
    WHERE recorded_at >= NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
```

---

## Row Level Security (RLS) — Supabase

```sql
-- Bật RLS cho tất cả bảng
ALTER TABLE price_observations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowdsource_submissions ENABLE ROW LEVEL SECURITY;

-- price_observations: ai cũng đọc được, chỉ service role mới write
CREATE POLICY "public read price"
    ON price_observations FOR SELECT
    USING (confidence >= 0.5);
    -- User thường chỉ thấy data đủ tin cậy

CREATE POLICY "service write price"
    ON price_observations FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
    -- Chỉ crawler (dùng service key) mới insert được

-- user_profiles: chỉ đọc/sửa profile của mình
CREATE POLICY "users own profile"
    ON user_profiles
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- price_alerts: chỉ đọc/sửa alert của mình
CREATE POLICY "users own alerts"
    ON price_alerts
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
```

---

## Thứ tự chạy Migration (bắt buộc theo đúng thứ tự)

```
Bước 1: Tạo bảng lookup (không có FK)
        → commodities
        → provinces

Bước 2: Tạo bảng chính (có FK đến bảng lookup)
        → price_observations
        → world_prices
        → weather_cache

Bước 3: Tạo bảng người dùng
        → user_profiles
        → price_alerts
        → crowdsource_submissions

Bước 4: Tạo bảng raw/error (không có FK)
        → raw_crawl_logs
        → ingestion_errors

Bước 5: Tạo stored functions (phụ thuộc bảng đã có)
        → get_recent_median()
        → count_records_last_hour()

Bước 6: Tạo triggers
        → trg_sync_slug trên price_observations

Bước 7: Tạo Materialized Views (phụ thuộc tất cả bảng trên)
        → daily_price_summary
        → regional_price_map
        → commodity_trends
        → weekly_price_history

Bước 8: Setup RLS policies

Bước 9: Setup pg_cron refresh schedules

Bước 10: Seed data
        → INSERT commodities
        → INSERT provinces
```

---

## API Query Examples (Next.js Server Component)

```typescript
// Lấy giá hôm nay — dùng materialized view, không query thẳng
const { data } = await supabase
  .from('daily_price_summary')
  .select('*')
  .eq('commodity_slug', 'sau-rieng')
  .eq('date', new Date().toISOString().split('T')[0])
  .order('avg_confidence', { ascending: false })

// Lấy xu hướng giá cho chatbot AI context
const { data: trends } = await supabase
  .from('commodity_trends')
  .select('commodity_slug, trend_7d_pct, trend_30d_pct, avg_7d')
  .in('commodity_slug', ['sau-rieng', 'ca-phe', 'lua-gao'])

// Lấy bản đồ giá theo tỉnh
const { data: map } = await supabase
  .from('regional_price_map')
  .select('province_code, avg_price, vs_national_avg')
  .eq('commodity_slug', 'ca-phe')
  .order('avg_price', { ascending: false })

// Lịch sử giá 30 ngày — dùng cho chart
const { data: history } = await supabase
  .from('daily_price_summary')
  .select('date, median_price, avg_price, observation_count')
  .eq('commodity_slug', 'tom-the')
  .gte('date', thirtyDaysAgo)
  .order('date', { ascending: true })
```

---

## Lưu ý quan trọng cho AI coding assistant

```
1. KHÔNG query thẳng price_observations trong API
   → Luôn dùng daily_price_summary hoặc các materialized views
   → Ngoại lệ: ingestion pipeline và admin dashboard

2. commodity_slug được denormalize vào price_observations
   → Trigger trg_sync_slug tự đồng bộ khi insert
   → KHÔNG cần JOIN commodities mỗi lần query

3. Crawler dùng SUPABASE_SERVICE_KEY (bypass RLS)
   → Frontend dùng SUPABASE_ANON_KEY (bị RLS filter)
   → KHÔNG bao giờ expose service key ra frontend

4. Khi thêm mặt hàng mới:
   → INSERT vào commodities trước
   → Thêm vào COMMODITY_MAP trong normalizer.py
   → Thêm vào PRICE_BOUNDS trong validators.py
   → Thêm seed vào file migration để reproducible

5. Materialized view dùng CONCURRENTLY khi refresh
   → Cho phép đọc trong khi đang refresh
   → Cần UNIQUE INDEX mới dùng được CONCURRENTLY

6. confidence >= 0.5 là threshold tối thiểu cho mọi query public
   → Ingestion pipeline lưu tất cả (kể cả confidence thấp)
   → View và API tự filter

7. province_code NULL là hợp lệ
   → Nghĩa là giá không xác định được tỉnh (vd: giá quốc gia)
   → Không reject records có province_code NULL
```
