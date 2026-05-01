# Ingestion & Validation Pipeline — AgriData VN
> Context prompt cho AI coding assistant. Implement theo đúng trình tự các bước dưới đây. Mỗi bước hoàn chỉnh trước khi sang bước tiếp theo.

---

## Tổng quan kiến trúc

```
Crawler (nhiều nguồn)
  → Redis Stream (Message Queue / buffer)
    → Worker (lấy message, chạy pipeline)
      → [B1] Schema Validation
        → [B2] Normalize (tên, giá, đơn vị, tỉnh)
          → [B3] Price Bounds Check
            → [B4] Freshness Check
              → [B5] Dedup Check
                → [B6] Spike Detection
                  → [B7] Confidence Score
                    → [B8] Insert Supabase
                    → (fail) → Error Queue
```

---

## Tech Stack

```
Language:   Python 3.11+
Queue:      Redis Stream (redis-py)
Validation: Pydantic v2
Database:   Supabase (supabase-py)
Deploy:     Railway.app (cron job)
Monitor:    Telegram Bot webhook
```

---

## Database Schema

> Chạy toàn bộ SQL này trên Supabase SQL Editor trước khi viết bất kỳ dòng Python nào.

```sql
-- Danh mục nông sản chuẩn hóa
CREATE TABLE commodities (
    id           SERIAL PRIMARY KEY,
    name_vi      TEXT NOT NULL,
    name_en      TEXT,
    slug         TEXT UNIQUE NOT NULL,
    hs_code      VARCHAR(10),
    category     TEXT,        -- 'fruit'|'rice'|'coffee'|'vegetable'|'seafood'
    unit_default TEXT DEFAULT 'kg'
);

-- Seed dữ liệu mặt hàng ban đầu
INSERT INTO commodities (name_vi, slug, category) VALUES
    ('Sầu riêng',  'sau-rieng', 'fruit'),
    ('Cà phê',     'ca-phe',    'coffee'),
    ('Lúa gạo',    'lua-gao',   'rice'),
    ('Tôm thẻ',    'tom-the',   'seafood'),
    ('Tôm sú',     'tom-su',    'seafood'),
    ('Cá tra',     'ca-tra',    'seafood'),
    ('Hồ tiêu',    'tieu',      'spice'),
    ('Điều',       'dieu',      'nut'),
    ('Mít Thái',   'mit-thai',  'fruit'),
    ('Thanh long', 'thanh-long','fruit'),
    ('Dưa hấu',    'dua-hau',   'fruit');

-- Bảng trung tâm lưu giá
CREATE TABLE price_observations (
    id              BIGSERIAL PRIMARY KEY,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    commodity_id    INT REFERENCES commodities(id),
    commodity_slug  TEXT NOT NULL,
    variety         TEXT,
    quality_grade   TEXT,
    province_code   VARCHAR(3),
    market_type     TEXT NOT NULL,   -- 'farm_gate'|'wholesale'|'retail'|'export'
    price_vnd       NUMERIC(12,2) NOT NULL,
    unit            TEXT DEFAULT 'kg',
    source          TEXT NOT NULL,
    source_url      TEXT,
    confidence      FLOAT DEFAULT 0.7,
    flags           TEXT[],
    is_verified     BOOLEAN DEFAULT FALSE,
    raw_payload     JSONB
);

-- Index tối ưu query
CREATE INDEX ON price_observations (commodity_id, recorded_at DESC);
CREATE INDEX ON price_observations (province_code, recorded_at DESC);
CREATE INDEX ON price_observations (commodity_slug, recorded_at DESC);

-- Bảng lưu lỗi để review
CREATE TABLE ingestion_errors (
    id          BIGSERIAL PRIMARY KEY,
    failed_at   TIMESTAMPTZ DEFAULT NOW(),
    source      TEXT,
    error_type  TEXT,
    reason      TEXT,
    raw_payload JSONB
);

-- Stored procedure lấy median 7 ngày (dùng cho spike detection)
CREATE OR REPLACE FUNCTION get_recent_median(
    p_commodity_id INT,
    p_province_code TEXT,
    p_days INT DEFAULT 7
)
RETURNS TABLE(median_price NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_vnd)
    FROM price_observations
    WHERE commodity_id = p_commodity_id
      AND province_code = p_province_code
      AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL
      AND confidence >= 0.5;
END;
$$ LANGUAGE plpgsql;

-- View tổng hợp giá ngày (dùng cho API)
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
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_vnd) AS median_price,
    COUNT(*)                        AS observation_count,
    AVG(confidence)                 AS avg_confidence
FROM price_observations
WHERE confidence >= 0.5
GROUP BY 1, 2, 3, 4, 5;
```

---

## Biến môi trường

```env
# .env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
REDIS_URL=redis://localhost:6379
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

---

## Pydantic Schemas (dùng xuyên suốt toàn bộ pipeline)

```python
# ingestion/schemas.py
from pydantic import BaseModel, validator, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class MarketType(str, Enum):
    FARM_GATE = "farm_gate"
    WHOLESALE = "wholesale"
    RETAIL    = "retail"
    EXPORT    = "export"

class RawPriceRecord(BaseModel):
    """Data thô từ crawler — validation lỏng, giữ nguyên format gốc"""
    commodity_name : str
    price_raw      : str       # "85,000" | "85k" | "85 nghìn" | "1.2 triệu"
    unit_raw       : str       # "kg" | "tấn" | "tạ" | "thùng"
    province       : Optional[str] = None
    market_type    : Optional[str] = None
    source         : str
    source_url     : str
    crawled_at     : datetime

    @validator('commodity_name')
    def name_not_empty(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError("Tên nông sản không hợp lệ")
        return v.strip()

    @validator('price_raw')
    def price_has_numbers(cls, v):
        if not any(c.isdigit() for c in v):
            raise ValueError(f"Không tìm thấy số trong: {v}")
        return v

class CleanPriceRecord(BaseModel):
    """Data đã chuẩn hóa — sẵn sàng insert vào DB"""
    commodity_id   : int
    commodity_slug : str
    price_vnd      : float
    unit           : str = "kg"
    province_code  : Optional[str] = None
    market_type    : MarketType = MarketType.WHOLESALE
    source         : str
    source_url     : str
    confidence     : float = Field(ge=0.0, le=1.0, default=0.7)
    flags          : list[str] = []
    crawled_at     : datetime
    raw_payload    : dict

class ValidationResult(BaseModel):
    passed             : bool
    reason             : Optional[str] = None
    flag               : Optional[str] = None
    confidence_penalty : float = 0.0
    note               : Optional[str] = None
```

---

## BƯỚC 1 — Insert thẳng vào DB (không Queue, không validation)

> Mục tiêu: có data thật chạy trên web nhanh nhất có thể.
> Hoàn thành bước này trước. Kiểm tra: mở Supabase table editor, thấy data vào là xong.

```python
# ingestion/simple_insert.py
import os
from supabase import create_client
from datetime import datetime

supabase = create_client(os.environ["SUPABASE_URL"],
                         os.environ["SUPABASE_SERVICE_KEY"])

def insert_price(commodity_slug: str, price_vnd: float,
                 province_code: str, source: str, source_url: str,
                 market_type: str = "wholesale"):
    """
    Insert đơn giản — không validate.
    Dùng tạm trong giai đoạn đầu để có data nhanh.
    """
    # Lấy commodity_id từ slug
    result = supabase.table('commodities')\
        .select('id')\
        .eq('slug', commodity_slug)\
        .single()\
        .execute()

    if not result.data:
        print(f"✗ Không tìm thấy commodity: {commodity_slug}")
        return

    supabase.table('price_observations').insert({
        "commodity_id"  : result.data['id'],
        "commodity_slug": commodity_slug,
        "price_vnd"     : price_vnd,
        "province_code" : province_code,
        "market_type"   : market_type,
        "source"        : source,
        "source_url"    : source_url,
        "recorded_at"   : datetime.now().isoformat(),
        "confidence"    : 0.7,
    }).execute()

    print(f"✓ Inserted: {commodity_slug} {price_vnd:,.0f}đ/kg [{province_code}]")
```

---

## BƯỚC 2 — Normalizer (chuẩn hóa trước khi validate)

> Implement sau khi Bước 1 đã chạy được.
> Kiểm tra: gọi từng hàm với input thực tế, in ra kết quả, xác nhận đúng.

```python
# ingestion/normalizer.py
import re
from typing import Optional

COMMODITY_MAP = {
    # Sầu riêng
    "sầu riêng"           : {"id": 1, "slug": "sau-rieng"},
    "sau rieng"            : {"id": 1, "slug": "sau-rieng"},
    "sầu riêng monthong"  : {"id": 1, "slug": "sau-rieng"},
    "sầu riêng ri6"       : {"id": 1, "slug": "sau-rieng"},
    "sr monthong"          : {"id": 1, "slug": "sau-rieng"},
    # Cà phê
    "cà phê nhân"         : {"id": 2, "slug": "ca-phe"},
    "cà phê robusta"      : {"id": 2, "slug": "ca-phe"},
    "cafe nhan"            : {"id": 2, "slug": "ca-phe"},
    "cà phê xô"           : {"id": 2, "slug": "ca-phe"},
    # Lúa
    "lúa ir504"           : {"id": 3, "slug": "lua-gao"},
    "lúa đông xuân"       : {"id": 3, "slug": "lua-gao"},
    "gạo 5% tấm"          : {"id": 3, "slug": "lua-gao"},
    # Tôm
    "tôm thẻ"             : {"id": 4, "slug": "tom-the"},
    "tôm sú"              : {"id": 5, "slug": "tom-su"},
    # Cá
    "cá tra"              : {"id": 6, "slug": "ca-tra"},
    # Tiêu, điều
    "hồ tiêu"             : {"id": 7, "slug": "tieu"},
    "tiêu"                : {"id": 7, "slug": "tieu"},
    "điều"                : {"id": 8, "slug": "dieu"},
    "hạt điều"            : {"id": 8, "slug": "dieu"},
    # Trái cây
    "mít thái"            : {"id": 9,  "slug": "mit-thai"},
    "thanh long"          : {"id": 10, "slug": "thanh-long"},
    "dưa hấu"             : {"id": 11, "slug": "dua-hau"},
    # Bổ sung thêm khi crawl gặp tên mới
}

UNIT_CONVERSION = {
    "kg"   : 1,
    "tấn"  : 0.001,    # 1 VNĐ/tấn = 0.001 VNĐ/kg
    "tạ"   : 0.01,     # 1 tạ = 100kg
    "yến"  : 0.1,      # 1 yến = 10kg
    "gram" : 1000,
    "g"    : 1000,
    # "thùng", "trái" → None → bỏ qua record này
}

PROVINCE_MAP = {
    "an giang"        : "89",
    "bà rịa vũng tàu" : "77",
    "bắc giang"       : "24",
    "bến tre"         : "83",
    "bình dương"      : "74",
    "bình phước"      : "70",
    "cà mau"          : "96",
    "cần thơ"         : "92",
    "đắk lắk"         : "66", "dak lak": "66",
    "đắk nông"        : "67",
    "đồng nai"        : "75",
    "đồng tháp"       : "87",
    "gia lai"         : "64",
    "hậu giang"       : "93",
    "kiên giang"      : "91",
    "kon tum"         : "62",
    "lâm đồng"        : "68", "lam dong": "68",
    "long an"         : "80",
    "ninh thuận"      : "58",
    "sóc trăng"       : "94",
    "tây ninh"        : "72",
    "tiền giang"      : "82", "tien giang": "82",
    "trà vinh"        : "84",
    "vĩnh long"       : "86",
    # Bổ sung 63 tỉnh thành đầy đủ
}

def parse_price_string(price_str: str) -> Optional[float]:
    """
    Convert mọi format giá VN về float (VNĐ).
    Quy tắc: dấu chấm ở VN là phân cách nghìn, không phải thập phân.
      "85.000"    → 85000.0
      "85,000"    → 85000.0
      "85k"       → 85000.0
      "85 nghìn"  → 85000.0
      "1.2 triệu" → 1200000.0
      "85"        → 85.0 (bounds check sẽ xử lý sau)
    """
    if not price_str:
        return None
    s = price_str.lower().strip()

    # Xử lý "triệu"
    if "triệu" in s or " tr" in s:
        num = re.search(r'[\d.,]+', s)
        if num:
            return float(num.group().replace(',', '.')) * 1_000_000

    # Xử lý "nghìn" / "ngàn" / "k"
    if "nghìn" in s or "ngàn" in s or s.endswith('k'):
        num = re.search(r'[\d.,]+', s)
        if num:
            return float(num.group().replace(',', '').replace('.', '')) * 1_000

    # Xử lý số thông thường
    s_clean = re.sub(r'[^\d.,]', '', s)
    if not s_clean:
        return None

    if ',' in s_clean and '.' in s_clean:
        s_clean = s_clean.replace('.', '').replace(',', '.')
    elif '.' in s_clean:
        parts = s_clean.split('.')
        if len(parts[-1]) == 3:    # "85.000" → phân cách nghìn
            s_clean = s_clean.replace('.', '')
        # else "85.5" → thập phân, giữ nguyên
    elif ',' in s_clean:
        s_clean = s_clean.replace(',', '')

    try:
        return float(s_clean)
    except ValueError:
        return None

def normalize_commodity(name: str) -> Optional[dict]:
    return COMMODITY_MAP.get(name.lower().strip())

def normalize_unit(unit_raw: str, price: float) -> Optional[float]:
    """Trả về giá VNĐ/kg. None nếu đơn vị không convert được."""
    factor = UNIT_CONVERSION.get(unit_raw.lower().strip())
    if factor is None:
        return None
    return price * factor

def normalize_province(province_str: str) -> Optional[str]:
    if not province_str:
        return None
    return PROVINCE_MAP.get(province_str.lower().strip())
```

---

## BƯỚC 3 — Price Bounds Validation

> Implement sau khi Normalizer đã chạy đúng.
> Kiểm tra: test với giá dưới min, trên max, và trong khoảng — xác nhận kết quả trả về đúng.

```python
# ingestion/validators.py
PRICE_BOUNDS = {
    # (min VNĐ/kg, max VNĐ/kg) — cập nhật khi thị trường thay đổi lớn
    "sau-rieng"  : (20_000,  250_000),
    "ca-phe"     : (30_000,  200_000),
    "lua-gao"    : (4_000,   20_000),
    "tom-the"    : (80_000,  400_000),
    "tom-su"     : (150_000, 600_000),
    "ca-tra"     : (25_000,  60_000),
    "tieu"       : (60_000,  200_000),
    "dieu"       : (20_000,  80_000),
    "mit-thai"   : (15_000,  60_000),
    "thanh-long" : (3_000,   60_000),
    "dua-hau"    : (3_000,   30_000),
}

def check_bounds(record: CleanPriceRecord) -> ValidationResult:
    bounds = PRICE_BOUNDS.get(record.commodity_slug)
    if not bounds:
        # Mặt hàng chưa có bounds → pass nhưng giảm confidence
        return ValidationResult(passed=True, confidence_penalty=0.1,
                                flag="no_bounds_defined")
    lo, hi = bounds
    if record.price_vnd < lo:
        return ValidationResult(passed=False,
            reason=f"Giá {record.price_vnd:,.0f} thấp hơn min {lo:,.0f}",
            flag="below_minimum")
    if record.price_vnd > hi:
        return ValidationResult(passed=False,
            reason=f"Giá {record.price_vnd:,.0f} cao hơn max {hi:,.0f}",
            flag="above_maximum")
    return ValidationResult(passed=True)
```

---

## BƯỚC 4 — Freshness Check

> Implement ngay sau Bounds Check.
> Kiểm tra: tạo record với crawled_at = 3 ngày trước, xác nhận bị reject.

```python
from datetime import datetime, timedelta

def check_freshness(record: CleanPriceRecord) -> ValidationResult:
    """Data không được cũ hơn 48 giờ."""
    age_hours = (datetime.now() - record.crawled_at).total_seconds() / 3600
    if age_hours > 48:
        return ValidationResult(passed=False,
            reason=f"Data quá cũ: {age_hours:.0f} giờ",
            flag="stale_data")
    return ValidationResult(passed=True)
```

---

## BƯỚC 5 — Dedup Check

> Implement sau Freshness Check.
> Kiểm tra: insert 2 record giống nhau trong vòng 6 tiếng, record thứ 2 phải bị reject.

```python
def check_duplicate(record: CleanPriceRecord, db) -> ValidationResult:
    """
    Trùng lặp = cùng commodity + province + market_type + source
    trong vòng 6 tiếng.
    Window 6 tiếng vì giá có thể thay đổi trong ngày.
    """
    result = db.table('price_observations')\
        .select('id')\
        .eq('commodity_id',  record.commodity_id)\
        .eq('province_code', record.province_code)\
        .eq('market_type',   record.market_type)\
        .eq('source',        record.source)\
        .gte('recorded_at',
             (datetime.now() - timedelta(hours=6)).isoformat())\
        .execute()

    if result.data:
        return ValidationResult(passed=False,
            reason="Bản ghi trùng lặp trong 6 giờ qua",
            flag="duplicate")
    return ValidationResult(passed=True)
```

---

## BƯỚC 6 — Spike Detection

> Implement sau khi đã có ít nhất 7 ngày dữ liệu trong DB.
> Lưu ý: KHÔNG reject spike — chỉ flag và giảm confidence.
> Spike có thể là thật (thiên tai, sự kiện thị trường đột biến).

```python
def check_spike(record: CleanPriceRecord, db) -> ValidationResult:
    """
    So sánh với median 7 ngày gần nhất.
    Biến động > 40% → flag + giảm confidence, KHÔNG reject.
    """
    result = db.rpc('get_recent_median', {
        'p_commodity_id'  : record.commodity_id,
        'p_province_code' : record.province_code,
        'p_days'          : 7
    }).execute()

    if not result.data or not result.data[0]['median_price']:
        # Chưa có lịch sử → bỏ qua kiểm tra này
        return ValidationResult(passed=True, flag="no_history")

    median_7d  = float(result.data[0]['median_price'])
    change_pct = abs(record.price_vnd - median_7d) / median_7d * 100

    if change_pct > 40:
        return ValidationResult(
            passed=True,               # Vẫn pass — chỉ flag
            confidence_penalty=0.3,
            flag="spike_detected",
            note=f"Biến động {change_pct:.1f}% vs median 7 ngày ({median_7d:,.0f}đ)"
        )
    return ValidationResult(passed=True)
```

---

## BƯỚC 7 — Confidence Score

> Implement cùng lúc với hoặc ngay sau Spike Detection.
> Confidence cuối = base_source - tổng penalty từ tất cả validators.

```python
# Confidence base theo độ tin cậy nguồn
BASE_CONFIDENCE = {
    "customs_gov"    : 0.95,   # Dữ liệu hải quan — cao nhất
    "agro_gov"       : 0.85,   # Cổng thông tin nhà nước
    "nongnghiep_vn"  : 0.75,   # Báo chuyên ngành nông nghiệp
    "shopee"         : 0.70,   # Giá niêm yết TMĐT
    "crowdsource"    : 0.60,   # Người dùng tự nhập — thấp nhất
}

def calculate_confidence(source: str, penalties: list[float]) -> float:
    base    = BASE_CONFIDENCE.get(source, 0.65)
    total   = sum(penalties)
    return max(0.1, base - total)   # Không bao giờ xuống dưới 0.1
```

---

## BƯỚC 8 — Redis Queue + Worker (thay thế insert thẳng ở Bước 1)

> Implement khi có từ 3+ nguồn crawl chạy song song.
> Bước này thay thế hoàn toàn simple_insert.py ở Bước 1.
> Kiểm tra: push 1 message vào queue, xác nhận worker xử lý và insert vào DB.

### 8a. Crawler đẩy vào Queue

```python
# crawler/base_crawler.py
import redis, json
from datetime import datetime

r = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)

def push_to_queue(raw_data: dict, source: str):
    """
    Mọi crawler gọi hàm này sau khi thu thập xong.
    Không validate gì ở đây — cứ đẩy vào queue.
    """
    r.xadd("price:raw", {
        "source"     : source,
        "crawled_at" : datetime.now().isoformat(),
        "raw"        : json.dumps(raw_data, ensure_ascii=False)
    })
```

### 8b. Worker hoàn chỉnh

```python
# ingestion/worker.py
import redis, json, os
from datetime import datetime
from supabase import create_client

r  = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
db = create_client(os.environ["SUPABASE_URL"],
                   os.environ["SUPABASE_SERVICE_KEY"])

def process_message(message: dict):
    source = message.get('source', 'unknown')
    raw    = json.loads(message.get('raw', '{}'))

    # --- Bước 1: Schema validation ---
    try:
        raw_record = RawPriceRecord(**raw, source=source,
                                    crawled_at=message['crawled_at'])
    except Exception as e:
        _error(message, "schema_invalid", str(e)); return

    # --- Bước 2: Normalize ---
    commodity = normalize_commodity(raw_record.commodity_name)
    if not commodity:
        _error(message, "unknown_commodity",
               raw_record.commodity_name); return

    price_raw = parse_price_string(raw_record.price_raw)
    if not price_raw:
        _error(message, "unparseable_price",
               raw_record.price_raw); return

    price_kg = normalize_unit(raw_record.unit_raw, price_raw)
    if not price_kg:
        _error(message, "unconvertible_unit",
               raw_record.unit_raw); return

    clean = CleanPriceRecord(
        commodity_id   = commodity['id'],
        commodity_slug = commodity['slug'],
        price_vnd      = price_kg,
        province_code  = normalize_province(raw_record.province or ''),
        market_type    = raw_record.market_type or MarketType.WHOLESALE,
        source         = source,
        source_url     = raw_record.source_url,
        confidence     = BASE_CONFIDENCE.get(source, 0.65),
        crawled_at     = raw_record.crawled_at,
        raw_payload    = raw
    )

    # --- Bước 3–6: Validators theo thứ tự ---
    checks = [
        ("bounds",     lambda r: check_bounds(r)),
        ("freshness",  lambda r: check_freshness(r)),
        ("duplicate",  lambda r: check_duplicate(r, db)),
        ("spike",      lambda r: check_spike(r, db)),
    ]

    penalties = []
    for name, fn in checks:
        result = fn(clean)
        if not result.passed:
            _error(message, result.flag, result.reason); return
        if result.flag:
            clean.flags.append(result.flag)
            penalties.append(result.confidence_penalty)

    # --- Bước 7: Confidence cuối ---
    clean.confidence = calculate_confidence(source, penalties)

    # --- Bước 8: Insert ---
    db.table('price_observations').insert({
        "commodity_id"  : clean.commodity_id,
        "commodity_slug": clean.commodity_slug,
        "price_vnd"     : clean.price_vnd,
        "unit"          : clean.unit,
        "province_code" : clean.province_code,
        "market_type"   : clean.market_type,
        "source"        : clean.source,
        "source_url"    : clean.source_url,
        "confidence"    : clean.confidence,
        "flags"         : clean.flags,
        "recorded_at"   : datetime.now().isoformat(),
        "raw_payload"   : raw
    }).execute()

    print(f"✓ {clean.commodity_slug} | {clean.price_vnd:,.0f}đ/kg "
          f"| conf={clean.confidence:.2f} | flags={clean.flags}")

def _error(message: dict, error_type: str, reason: str):
    """Đẩy record lỗi vào error queue + lưu DB để review."""
    r.xadd("price:errors", {
        "original"  : json.dumps(message, ensure_ascii=False),
        "error_type": error_type,
        "reason"    : reason,
        "failed_at" : datetime.now().isoformat()
    })
    db.table('ingestion_errors').insert({
        "source"     : message.get('source'),
        "error_type" : error_type,
        "reason"     : reason,
        "raw_payload": message
    }).execute()
    print(f"✗ {error_type}: {reason}")

def run():
    """Chạy liên tục, đọc từ Redis Stream."""
    print("Worker started → listening price:raw ...")
    last_id = '$'    # Chỉ đọc message mới từ lúc worker start

    while True:
        messages = r.xread({'price:raw': last_id},
                            count=10, block=5000)
        if not messages:
            continue
        for _, stream_messages in messages:
            for msg_id, msg_data in stream_messages:
                try:
                    process_message(msg_data)
                except Exception as e:
                    print(f"Unexpected: {e}")
                finally:
                    last_id = msg_id   # Cập nhật dù thành công hay thất bại

if __name__ == "__main__":
    run()
```

---

## BƯỚC 9 — Monitoring & Health Check

> Implement sau khi toàn bộ pipeline đã chạy ổn định.
> Chạy script này mỗi giờ qua cron job trên Railway.

```python
# ingestion/monitor.py
import redis, os, requests
from supabase import create_client

r  = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
db = create_client(os.environ["SUPABASE_URL"],
                   os.environ["SUPABASE_SERVICE_KEY"])

def send_telegram(msg: str):
    requests.post(
        f"https://api.telegram.org/bot{os.environ['TELEGRAM_BOT_TOKEN']}/sendMessage",
        json={"chat_id": os.environ["TELEGRAM_CHAT_ID"], "text": msg}
    )

def health_check():
    queue_depth    = r.xlen("price:raw")
    error_count    = r.xlen("price:errors")
    records_1h     = db.table('price_observations')\
                       .select('id', count='exact')\
                       .gte('recorded_at',
                            (datetime.now() - timedelta(hours=1)).isoformat())\
                       .execute().count

    alerts = []

    if queue_depth > 1000:
        alerts.append(f"⚠️ Queue tắc: {queue_depth} messages đang chờ")

    if error_count > 50:
        alerts.append(f"⚠️ Lỗi cao: {error_count} lỗi trong queue")

    if records_1h < 10:
        alerts.append(f"⚠️ Data vào ít bất thường: {records_1h} records/giờ — crawler có thể bị chặn")

    if alerts:
        send_telegram("🚨 AgriData Pipeline Alert\n" + "\n".join(alerts))
    else:
        print(f"✓ OK — queue={queue_depth} errors={error_count} records_1h={records_1h}")

if __name__ == "__main__":
    health_check()
```

---

## Lưu ý quan trọng cho AI coding assistant

```
1. KHÔNG reject spike — chỉ giảm confidence và flag, vẫn lưu vào DB.
   Spike có thể là thật (thiên tai, sự kiện thị trường).

2. Luôn lưu raw_payload — mọi bản ghi phải có raw data gốc để debug.

3. Dấu chấm ở VN là phân cách nghìn:
   "85.000" = 85000, KHÔNG phải 85.0

4. Dedup window = 6 tiếng, KHÔNG phải 24 tiếng.
   Giá có thể thay đổi nhiều lần trong ngày.

5. Confidence không bao giờ xuống dưới 0.1.
   API chỉ dùng records có confidence >= 0.5.

6. Bước 1 (insert thẳng) là bắt buộc trước khi làm các bước sau.
   Không được bỏ qua để đi thẳng vào Queue + Worker.

7. Khi thêm mặt hàng mới:
   - INSERT vào bảng commodities trước
   - Thêm vào COMMODITY_MAP trong normalizer.py
   - Thêm vào PRICE_BOUNDS trong validators.py
```
