# 🧠 AI Project Context & Memory Log (Dự án Nông Sản VN)

> **THÔNG ĐIỆP DÀNH CHO BẤT KỲ AI AGENT NÀO (ANTIGRAVITY, CURSOR, WINDSURF...):**  
> Khi bạn bắt đầu một phiên làm việc mới trong dự án này, **BẮT BUỘC** phải đọc qua file này. Nó chứa toàn bộ bối cảnh dự án, kiến trúc hệ thống và lịch sử để bạn tiếp tục công việc ngay lập tức mà không cần rà quét lại toàn bộ thư mục.
> 
> *Bạn phải TỰ ĐỘNG CẬP NHẬT (Update) file này mỗi khi thêm mới Component quan trọng, tạo một Page mới, cài một thư viện mới, hoặc thay đổi Logic Data/State.*
>
> **QUAN TRỌNG: Quản lý Task bằng Beads**
> Dự án này sử dụng `beads` (`bd`) làm công cụ quản lý task/trí nhớ. Hãy sử dụng lệnh `bd` trên terminal thay vì lập markdown plan thông thường. (Ví dụ: `bd create "Title"`, `bd show <id>`, `bd update <id> --claim`, `bd ready`). Tham khảo `AGENTS.md` được tạo tự động để biết thêm cách dùng chuẩn.

---

## 1. 🏗️ Mô hình Kiến Trúc Hiện Tại (Architectural Model)

- **Công nghệ cốt lõi:** React (Frontend) chạy trên Vite (siêu tốc độ).
- **Ngôn ngữ:** TypeScript & JavaScript.
- **Styling:** Vanilla CSS. Hệ thống Style tối ưu bằng biến CSS toàn cục ở `src/index.css`.
- **Framework Tư Duy (Skills):** 
  - `world_class_senior_dev`: Tư duy phản biện, QA, thiết kế kiến trúc trước khi code, DRY/SOLID.
  - `taste-skill`: Giao diện cao cấp (Premium). Glassmorphism, Diffusion Shadows, viền 1px, Animation vật lý.
- **Dev server:** `npm run dev` → http://localhost:5173

## 2. 📂 Cấu trúc File & Component Hiện Tại

```
src/
├── index.css              ← Design system: màu, font Outfit, animation, CSS tokens
├── main.tsx               ← Entry point
├── App.tsx                ← Layout root: Navbar + Routes + Footer
├── App.css                ← .app-body { padding-top: var(--navbar-h) }
│
├── components/
│   ├── Navbar.tsx/.css    ✅ Fixed navbar, logo, nav links, live clock, LIVE badge, mobile
│   ├── TickerBar.tsx/.css ✅ Sticky scrolling ticker (infinite loop, pause-on-hover)
│   ├── SummaryCards.tsx/.css ✅ 4 KPI cards (VN market)
│   ├── TopMovers.tsx/.css ✅ Spotlight section: top 3 tăng + top 3 giảm
│   ├── PriceTable.tsx/.css ✅ Full data table (VN market)
│   ├── DetailModal.tsx/.css ✅ Detail popup
│   ├── Footer.tsx/.css    ✅ Footer pháp lý
│   ├── marketplace/       ✅ Marketplace components
│   └── world/             ✅ [NEW] World prices components
│       ├── WorldSummaryCards.tsx/.css  ← 4 KPI cards (thế giới)
│       └── WorldPriceTable.tsx/.css   ← Bảng giá thế giới (filter, sort, search, 52W, VND)
│
├── pages/
│   ├── HomeDashboard.tsx  ✅ Trang chính /
│   ├── MarketplacePage.tsx/.css ✅ Trang /marketplace
│   └── WorldPricesPage.tsx/.css ✅ [NEW] Trang /thegioi
│
└── data/
    ├── nongSanData.ts     ✅ 35 mặt hàng VN, 5 danh mục
    └── worldCommodityData.ts ✅ [NEW] 29 mặt hàng thế giới, types, fallback data

server/                    ← [NEW] Express.js Backend (port 3001)
├── index.ts               ← Entry point: Express + CORS + logging
├── routes/
│   └── worldPrices.ts     ← /api/world-prices, /api/exchange-rate
├── services/
│   ├── worldBankService.ts ← Parse World Bank Pink Sheet XLSX
│   └── cacheService.ts    ← File-based JSON cache (TTL 24h)
├── data/cache/            ← Cached JSON files
├── package.json           ← express, xlsx, tsx
└── tsconfig.json          ← Node.js TypeScript config
```

## 3. 🎨 Design System (Tokens)

| Token | Giá trị |
|-------|---------|
| `--color-primary` | hsl(142, 70%, 29%) — Emerald Green |
| `--color-accent` | hsl(35, 95%, 55%) — Golden Sun |
| `--color-up` | hsl(142, 65%, 32%) — Tăng |
| `--color-down` | hsl(0, 72%, 42%) — Giảm |
| `--navbar-h` | 64px |
| `--ticker-h` | 40px |
| Font | Outfit (Google Fonts) |

## 4. 📝 Nhật ký Thay đổi Hệ thống (Changelog)

- **[30/04/2026] V0.5 - Tích hợp hệ thống quản lý nhớ (Beads):**
  - Cài đặt và tích hợp công cụ `beads` (`bd`) vào dự án để hỗ trợ quản lý task/memory.
  - Các AI Agent (Antigravity, Cursor, Windsurf, Claude Code...) hiện được hướng dẫn sử dụng `bd` cho công việc quản lý.

- **[07/04/2026] V0.2 - Dashboard hoàn chỉnh:**
  - Xây dựng `PriceTable` (filter, search, sort, 52W range bar, badge)
  - Xây dựng `TopMovers` spotlight section
  - Lắp ráp `App.tsx` đầy đủ với tất cả component
  - Cập nhật `App.css` với `.app-body`
  - Dashboard LIVE tại localhost:5173 ✅

- **[06/04/2026] V0.1 - Khởi tạo Môi trường Chuẩn:**
  - Cài đặt Node.js LTS.- **Framework**: React 18, Vite, Typecript, vanilla CSS (`index.css`), React Router DOM.
- **Data**: Mock data giả lập giá nông sản (nongSanData.ts).

## 🚀 Tiến trình (Progress History):

### V0.1: Foundation & Layout
- Cài đặt cấu trúc cốt lõi.
- Xây dựng hệ thống Component Vibe Coding với CSS Variables, thiết kế màu sắc Premium (Lấy cảm hứng từ bảng điện tử Investing/Stock market).
- Hoàn thiện Navbar cố định (có hiệu ứng glassmorphism & hiển thị đồng hồ thời gian thực).
- Hoàn thiện TickerBar (dải chạy ngang dạng băng chuyền vô cực dùng CSS Animation).

### V0.2: Bảng giá Cốt lõi & Dynamic Analytics
- Hoàn thiện 4 KPI Summary Cards (chỉ số Index mô phỏng).
- Hoàn thiện PriceTable trang bị bộ tính năng "khủng": 
  - Khung Tab phân loại Danh mục (Filter Tab).
  - Khung tìm kiếm thời gian thực.
  - Sắp xếp Header (Thực sự tương tác sort tăng/giảm theo tên, giá, %.v.v.).
  - Progress bar dải 52 tuần hiển thị tương quan giá cả.
  - Animation Highlight cho hàng (row) khi vừa update và Staggered reveal.
- TopMovers (spotlight: top gainers + losers).
- Bổ sung Footer pháp lý và Detail Modal pop-up giả lập thông tin chi tiết. 
- Xây dựng Mini sparkline SVG ở từng hàng.
- Nút Toggle Dark / Light Mode ở Navbar.

### V0.3: Client Side Routing & Marketplace (Chợ Báo giá)
- Chuyển hóa dự án thành SPA (Multi-page cảm quan) bằng `react-router-dom`.
- Nâng cấp Navbar hỗ trợ `Link` động.
- Tạo trang `/marketplace` (Báo giá Nông sản) kết hợp Form Đăng tin và Feed danh sách chào bán (Grid UI kết hợp Mock Image upload).

### V0.4: Full-Stack Architecture + Giá Nông Sản Thế Giới
- **Backend Express.js** (`server/`) chạy port 3001 cùng repo.
  - `server/index.ts` — Express server entry point (CORS, logging, routes)
  - `server/routes/worldPrices.ts` — API `/api/world-prices` + `/api/exchange-rate`
  - `server/services/worldBankService.ts` — Download & parse World Bank Pink Sheet XLSX
  - `server/services/cacheService.ts` — File-based JSON cache (TTL 24h)
- **Vite Proxy** (`vite.config.ts`) — `/api/*` → `:3001` (zero CORS issues)
- **`concurrently`** — `npm run dev` khởi động cả frontend + backend song song
- **Trang `/thegioi`** — Giá nông sản thế giới:
  - `src/pages/WorldPricesPage.tsx/.css` — Page component with API fetch + fallback
  - `src/components/world/WorldSummaryCards.tsx/.css` — 4 KPI cards (tổng, top tăng/giảm, tỷ giá)
  - `src/components/world/WorldPriceTable.tsx/.css` — Bảng giá (filter, sort, search, 52W bar, exchange badge, VND column)
  - `src/data/worldCommodityData.ts` — Types + fallback data (29 mặt hàng XK VN)
- Navbar thêm link "Thế giới" → `/thegioi`

## 5. 🎯 Tình trạng Hiện tại (Current Status)

**V0.4 COMPLETE — Full-Stack Application (Dashboard + Marketplace + Thế giới) đang chạy ở localhost:5173 + localhost:3001**

### ✅ Đã hoàn thành:
- Navbar (fixed, glassmorphism, live clock, LIVE badge, mobile)
- TickerBar (sticky, infinite scroll, pause on hover)
- SummaryCards (4 KPI, animated)
- PriceTable (filter, sort, search, 52W bar, recommendation badge)
- TopMovers (spotlight: top gainers + losers)
- Routing (React Router DOM)
- Marketplace Page (Feed + Form)
- **[NEW] Express.js Backend (port 3001)**
- **[NEW] World Bank Pink Sheet parser + cache**
- **[NEW] World Prices Page (/thegioi) — 29 mặt hàng XK VN**
- **[NEW] Vite Proxy /api → Express**
- **[NEW] Cột giá VND (tỷ giá 25.850)**

### 🔜 Bước tiếp theo (Roadmap):
- Phân trang (Pagination) hoặc tính năng Load More cho Feed chợ.
- Kết nối API thật qua Commodities-API hoặc Websocket để giá realtime.
- Deploy: Frontend trên Vercel/Netlify, Backend trên Railway/Render.
## 6. Session Notes

- [01/05/2026] Marketplace Supabase wiring:
  - Added `@supabase/supabase-js` to the Vite app.
  - Enabled Vite `envPrefix` for both `VITE_` and `NEXT_PUBLIC_` so the current `.env` keys can be used without renaming.
  - Added client-side Supabase config and marketplace data services in `src/lib/`.
  - Replaced mocked marketplace feed/form with live Supabase read/write flow against `marketplace_listings` by default.
  - Added optional env override `SUPABASE_MARKETPLACE_TABLE` (`VITE_` or `NEXT_PUBLIC_`) if the table name differs.
- [01/05/2026] Supabase curated model migration:
  - Initialized Supabase CLI in-repo (`supabase/`) and added the first migration for commodities, provinces, price observations, world prices, raw logs, ingestion errors, user profiles, alerts, crowdsource submissions, materialized views, RLS, and refresh helpers.
  - Added server-side Supabase runtime helpers and a Supabase-aware market data service that ingests crawler outputs when `SUPABASE_SERVICE_ROLE_KEY` is available, then reads VN/world responses from curated Supabase views.
  - Removed the public marketplace listing UI and route from the current website. Future user-submitted pricing is preserved only at the data-model level via `crowdsource_submissions`.
  - Added fallback behavior so the app still serves legacy file-cache data if the remote Supabase schema has not been applied yet or the service role key is missing.
- [01/05/2026] Project security skill:
  - Added `.agent/skills/web-security` so AI agents load web-security guardrails when explicitly asked for security work and when implementing security-sensitive features.
  - Documented project hotspots for Supabase client separation, RLS, ingestion, redirects, secrets, and future crowdsource submission flows.
  - Refined the skill from the full `claude promt generated/web-security.md` prompt by adding a two-pass audit method, an explicit security checklist, and a reporting structure for review tasks.
