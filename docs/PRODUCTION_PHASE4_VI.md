# MUSIC FUQ ME 2.3 — PHASE 4: TRIỂN KHAI ONLINE (PRODUCTION GATE)

## Trạng thái đã biết (13/11/2026)

- Người dùng xác nhận script migration `APPLY`: examined 760, migrated 760, bytes 4.196.670.626, missing 0, errors 0. **Chưa có quyền Cloudflare hoặc bản xuất PostgreSQL live để đối chiếu**.
- Repo GitHub `nam4eb/music-fk-my-ear` nhánh `main` đọc ngày 13/11 còn là commit đầu tiên (source phiên bản cũ). Cần push source local v2.3 lên GitHub trước khi deploy. Không deploy trực tiếp bản main cũ.
- Phải xác minh `tracks_local=0`, `covers_local=0`. Con số 765 bài từng thấy trên giao diện không tự chứng minh 765 bài đều đã chuyển.
- Thư viện phải được chuyển **cả PostgreSQL**, không chỉ âm thanh R2. SQL khởi tạo database trắng sẽ làm mất danh sách/metadata nếu dùng thay restore.

## Kiến trúc đầu tiên (không tự đăng ký gói trả phí)

- **Web**: GitHub Pages từ `apps/web/out` qua GitHub Actions, domain dự kiến `https://nam4eb.github.io/music-fk-my-ear/` sau khi bật Pages.
- **API**: Render web service từ Dockerfile `apps/api/Dockerfile`, cấu hình `render.yaml`. Render Free ngủ khi không có truy cập 15 phút, có cold start, không nên xem là SLA production; phù hợp beta cá nhân. Với truy cập liên tục, chọn gói dịch vụ có phí sau khi chủ sở hữu duyệt.
- **Metadata**: Neon PostgreSQL Free, restore từ database local bằng `pg_dump/pg_restore`. Dùng `sslmode=require`, không dùng Render Free PostgreSQL (hết hạn 30 ngày).
- **Music**: Cloudflare R2 Standard private, presigned PUT/GET từ Express; không bật public bucket.
- **Google Sign-In**: đăng ký thêm origin `https://nam4eb.github.io` (hoặc origin domain web thực tế) trong Authorized JavaScript origins của OAuth Web Client đang dùng.

## A. Chuẩn bị dữ liệu — tuyệt đối không xóa nguồn

Tại `D:\Project\music-fk-my-ear`, cập nhật source V2.3 rồi chạy:

```powershell
.\deploy\check-local-db.ps1
.\deploy\export-local-db.ps1
```

`check-local-db` phải trả `tracks_local=0`, `covers_local=0` và ghi lại tổng `tracks_total`, `tracks_r2`, `r2_audio_bytes`, `playlists`, `users`. Nếu số lượng khác 765, giải thích 5 bài chênh trước khi cutover.

Chọn **Neon project mới trống**, tạo database user bằng Neon Dashboard, lưu URL kết nối Postgres qua `sslmode=require`, rồi phục hồi:

```powershell
.\deploy\restore-neon.ps1 -DumpFile '.\backups\music-fuq-me-YYYYMMDD-HHMMSS.dump'
```

Đối chiếu `SELECT count(*)`, tổng `size_bytes`, `storage_driver`, `playlists`, `playlist_tracks`, `listening_events` giữa Neon và local. Không chạy `001_init.sql` lên Neon trước pg_restore. Giữ file `.dump` riêng tư.

## B. Đưa source v2.3 lên GitHub

```powershell
cd D:\Project\music-fk-my-ear
# kiểm tra git status trước, bảo đảm không đưa .env, .music-uploads, backups lên repo
npm install
npm run build:core
npm run build:api
npm run build:web
npm test
npm run test:r2
# Có thể cần npm run test:owner (xem workspace API)
git status --short
git add .
git diff --cached --name-only
git commit -m 'release: Music Fuq Me v2.3 R2 production-ready'
git push origin main
```

**Không push** nếu `git diff --cached --name-only` có `.env`, `.dump`, `.music-uploads`, private keys hoặc token. Commit `package-lock.json` được sinh từ `npm install` để có reproducible builds; production workflow nên dùng `npm ci` sau khi có lockfile.

## C. Backend Render

Trên Render Dashboard, tạo **Blueprint** từ GitHub repo và `render.yaml`; nhập các secret `sync: false` bằng trang Render. Không gửi key lên chat:

- `DATABASE_URL` Neon đã restore;
- `GOOGLE_CLIENT_ID`, `GOOGLE_OWNER_EMAIL` trùng tài khoản hiện dùng;
- `CORS_ORIGINS=https://nam4eb.github.io` (origin, không `/music-fk-my-ear`);
- `API_PUBLIC_URL=https://<service-name>.onrender.com` (URL **thực tế** mà Render cấp);
- `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` như local;
- `JWT_SECRET` Render tự sinh riêng;
- `NODE_ENV=production`, `STORAGE_DRIVER=r2`, `PORT=4000`.

Không đặt `R2_*`, `JWT_SECRET`, `DATABASE_URL` vào frontend, GitHub repo hoặc `NEXT_PUBLIC_*`. Render free không có ổ đĩa bền vững, vì thế **bài nào còn local sẽ không phát**. Chờ `/ready` 200 trước bước web.

Kiểm tra:

```powershell
.\deploy\verify-api.ps1 -ApiUrl 'https://<service-name>.onrender.com'
```

`/health` chỉ là liveness, `/ready` xác thực PostgreSQL bằng `SELECT 1`, không truy cập R2. `r2:check` trên máy có R2 key vẫn cần PASS độc lập.

## D. GitHub Pages frontend

Vào repo → Settings → Secrets and variables → Actions → Variables, khai báo `NEXT_PUBLIC_API_URL=https://<service-name>.onrender.com` (**không kèm dấu `/` cuối**).

Repo → Settings → Pages → Source: **GitHub Actions**. Workflow `.github/workflows/deploy-pages.yml` build Next static export với `NEXT_PUBLIC_BASE_PATH=/music-fk-my-ear`, publish `apps/web/out`.

URL chỉ được xác nhận sau khi GitHub Actions deploy thành công; dự kiến `https://nam4eb.github.io/music-fk-my-ear/`.

## E. Google OAuth và R2 CORS

- Google Cloud Console → OAuth 2.0 Web Client → thêm Authorized JavaScript origins: `https://nam4eb.github.io` hoặc domain web thực tế. Giữ localhost nếu tiếp tục dev. Không thêm đường dẫn project vào origin.
- Cloudflare R2 bucket → CORS → thêm origin web HTTPS tương ứng; methods `GET`, `PUT`, `HEAD`; headers `Content-Type`, `Range`; không wildcard origin nếu không cần.
- Không public bucket; chỉ cấp S3 Object Read/Write trên đúng bucket cho Backend. Không dùng R2 secret ở trình duyệt.

## F. Production smoke có giới hạn

1. Mở Pages HTTPS bằng trình duyệt ẩn danh và trên điện thoại.
2. Đăng nhập Google đúng tài khoản owner; tài khoản khác phải bị từ chối.
3. Kiểm tra số bài trong Library, playlist, favorites, nghe và tua 3 bài từ R2, thử một bài có dấu tiếng Việt.
4. Thêm một **bài thử nghiệm riêng**, phát lại, rồi xóa đúng bài thử nghiệm và kiểm tra không làm mất bài khác.
5. Xác nhận trên điện thoại truy cập được khi máy Windows đã ngắt API local; test lại sau Render Free spin-down.
6. Chỉ coi là PRODUCTION PASS khi API URL/public Web URL, Google, PostgreSQL số dòng, 100% R2 items, end-to-end đều PASS.

## Rollback

Không xóa R2, local music, Docker volume hoặc dump. Nếu lỗi Web, rollback GitHub Pages workflow/commit; nếu API lỗi, rollback Render service; nếu database restore sai, tạo Neon database **mới trống** và phục hồi lại dump, không chạy các lệnh DROP trên local. Không tự sửa `storage_driver` hàng loạt.

## Giới hạn

Mã có readiness check và scripts, nhưng **chưa kiểm tra live Neon/Render/Cloudflare OAuth/Pages từ môi trường này**. Không có chứng cứ đã triển khai sản phẩm production khi chưa có URL thật và smoke PASS.
