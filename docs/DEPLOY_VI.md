# HƯỚNG DẪN TRIỂN KHAI VIBEBOX 2.0

## 1. Kiến trúc triển khai (đề xuất cho một người dùng)

- **GitHub**: repo mã nguồn, có thể là **public** vì KHÔNG chứa secrets.
- **GitHub Pages**: host static Next.js app (nhánh main, workflow `.github/workflows/deploy-pages.yml`).
- **Render Web Service Free** (hoặc Node host khác): chạy Express backend. Render Free sleep khi nhàn rỗi và có giới hạn; có thể bật dậy chậm.
- **Neon Free PostgreSQL**: chứa tracks, playlists, history (không lưu nhạc nhị phân).
- **Cloudflare R2 Standard**: bucket private lưu nhạc và ảnh bìa.

> GitHub Pages KHÔNG thể chạy Express, PostgreSQL, hoặc cất secrets. Next.js bắt buộc build `output: 'export'` cho Pages. Điện thoại phải có mạng để stream nhạc R2; app shell có service worker cache cơ bản, chưa tải nhạc offline.

## 2. Chạy local trước (thử được mà chưa cần R2)

Yêu cầu: Node >=22, npm >=10, Docker Desktop hoặc PostgreSQL 16.

Từ thư mục gốc:

```bash
docker compose up -d db
# Lần đầu, tạo bảng. An toàn khi chạy lại với IF NOT EXISTS.
docker compose exec -T db psql -U vibebox -d vibebox < apps/api/sql/001_init.sql
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
```

Windows PowerShell dùng `Copy-Item` thay `cp`. Đối với lệnh SQL, PowerShell chuyển hướng `<` không hoạt động trực tiếp: sử dụng:

```powershell
Get-Content apps/api/sql/001_init.sql -Raw | docker compose exec -T db psql -U vibebox -d vibebox
```

Trong `apps/api/.env` đổi `JWT_SECRET` thành chuỗi **ngẫu nhiên >=32 ký tự**; đổi `SETUP_TOKEN` thành mã ngẫu nhiên riêng, ít nhất 16 ký tự; giữ `STORAGE_DRIVER=local` để phát file từ máy; không public API này.

Mở hai terminal tại thư mục gốc:

```bash
npm run dev:api
npm run dev:web
```

Truy cập **http://localhost:3000**; giao diện lần đầu yêu cầu **email, password >= 12 ký tự, setup token** trùng `.env` của API. Tài khoản owner chỉ được tạo **một lần**. Sau khi tạo, form chuyển thành login thường.

Sau login: chọn Upload, tải nhạc, bấm bài để phát, chỉnh tags bằng `•••`, tạo playlist, nghe Daily Mix và xem thống kê. File ở `apps/api/.music-uploads` khi dùng local mode (vì npm workspace chạy từ thư mục API).

## 3. Neon PostgreSQL

1. Tạo Neon project tại https://neon.com/, lấy Postgres **connection string**; nên chọn pooled connection URL cho API dạng serverless nếu khuyến nghị bởi Neon.
2. Vào Neon SQL Editor, chạy nội dung `apps/api/sql/001_init.sql`.
3. Lưu connection string vào biến môi trường `DATABASE_URL` **trên host API**, không đưa vào Next.js/GitHub Pages.
4. Không chạy script tạo bảng trên database chứa ứng dụng khác mà không kiểm tra trước.

## 4. Cloudflare R2

1. Vào Cloudflare Dashboard → R2 → tạo bucket `vibebox-private` với **Standard** storage class; giữ bucket **private**.
2. Tạo **R2 S3-compatible API token** với quyền đọc/ghi object, giới hạn đúng bucket này. Lấy Account ID để lập `R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com`.
3. Thiết lập host API với:

```ini
STORAGE_DRIVER=r2
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=vibebox-private
R2_ACCESS_KEY_ID=...SECRETS...
R2_SECRET_ACCESS_KEY=...SECRETS...
```

4. R2 Bucket → Settings → CORS Policy: copy file `docs/r2-cors.json`, chỉnh lại origins (nhớ `https://nam4eb.github.io` không bao gồm path `/vibebox`). Nếu hosting site khác, thêm đúng HTTPS origin.
5. **Không tạo public bucket** và không commit secret. API dùng `signed PUT` tối đa 15 phút; `signed GET` 60 phút. URLs có token nên không chia sẻ.
6. R2 CORS quan trọng cho upload và playback. Nếu browser báo CORS, kiểm tra AllowedOrigins, Content-Type, Range, và origin hiện tại.

## 5. Deploy Express API lên Render

1. Push repo lên GitHub. Render → New Web Service → kết nối repo.
2. Runtime Node. Thiết lập ở thư mục root:
   - Build command: `npm install --no-audit --no-fund && npm run build:core && npm run build:api`
   - Start command: `node apps/api/dist/index.js`
3. Environment variables:

```ini
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...  # Neon URL
JWT_SECRET=...                 # random 32+ chars
SETUP_TOKEN=...                # private, random 16+ chars
CORS_ORIGINS=https://nam4eb.github.io
API_PUBLIC_URL=https://YOUR-RENDER-SERVICE.onrender.com
STORAGE_DRIVER=r2
R2_ENDPOINT=...
R2_BUCKET=vibebox-private
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
MAX_UPLOAD_MB=100
```

Render thường cung cấp PORT tự động; cấu hình PORT nếu được phép, hoặc bỏ nó để dùng biến PORT của Render. `GET /health` phải trả JSON `ok:true`. Nếu cần `POST /api/auth/setup`, form chỉ cho tạo tài khoản khi database **chưa có user**; giữ SETUP_TOKEN bí mật.

### Lưu ý Render Free

Free Web Services có thể spin down sau 15 phút không hoạt động, lần mở lại mất khoảng một phút. Disk của Render Free là ephemeral: **đừng dùng STORAGE_DRIVER=local trong production**. Dùng R2. Render Postgres Free hết hạn sau 30 ngày nên chọn Neon Free cho Postgres lâu dài.

## 6. Deploy Next.js qua GitHub Pages

1. Tạo repo **public** tên `vibebox` ở GitHub (có thể đổi tên nhưng phải chỉnh `NEXT_PUBLIC_BASE_PATH` trong workflow).
2. Commit toàn bộ project (đặc biệt `.github/workflows/deploy-pages.yml`). **Không commit `.env`**.
3. Trong repo → Settings → Secrets and variables → Actions → Variables → New repository variable:
   - `NEXT_PUBLIC_API_URL=https://YOUR-RENDER-SERVICE.onrender.com` (không có slash cuối).
4. Repo → Settings → Pages → Source: **GitHub Actions**.
5. Push nhánh `main`, workflow build `@vibebox/core`, test, build Next static export và publish `apps/web/out`.
6. Mở `https://YOUR-USERNAME.github.io/vibebox/`. Trên iOS Safari: Share → Add to Home Screen. Trên Android Chrome: Add to Home screen / Install app.
7. Frontend build-time API URL là **public** (không đặt secrets vào `NEXT_PUBLIC_*`). Backend CORS phải whitelist chính xác origin GitHub Pages; R2 CORS cũng vậy.

## 7. Các vấn đề bảo mật và vận hành

- Mật khẩu được bcrypt hash trước khi lưu. JWT 7 ngày lưu trong **localStorage** để hỗ trợ GitHub Pages và API khác origin; chỉ đăng nhập trên thiết bị đáng tin cậy. Thiết kế production nhạy cảm hơn nên ưu tiên chung origin và HttpOnly cookie.
- Xóa localStorage hoặc đăng xuất sẽ xóa token, **không xóa nhạc trong R2**.
- CORS và URL ký riêng ngăn public trực tiếp. Tuy nhiên, bất kỳ ai có signed URL còn hạn đều có thể truy cập file đó.
- Đừng upload tài liệu hoặc nhạc không có quyền sử dụng. VibeBox không cung cấp nhạc từ các nguồn có bản quyền.
- Upload hiện có giới hạn file 100 MB cấu hình được; ảnh bìa tối đa 5 MB.
- Playlist, history và tags đồng bộ qua PostgreSQL; web client chưa có chức năng download hàng loạt để phát offline.
- Backup: Export bảng `users/tracks/playlists/listening_events` của Neon và sao lưu riêng R2 bucket. Đặt lịch sao lưu theo nhu cầu.
- Thiết kế là **single-owner**; không có đăng ký đại trà, không có admin cho nhiều tài khoản.

## 8. Kiểm tra đầu cuối sau khi deploy

- [ ] API `/health` trả `ok:true`.
- [ ] SQL migration xong và `/api/config` trả `needsSetup:true` trước tạo owner.
- [ ] Tạo owner lần đầu, đăng xuất rồi đăng nhập lại.
- [ ] Upload một bài MP3, hoàn tất không có lỗi CORS.
- [ ] Phát, tua, next, pause, shuffle và repeat.
- [ ] Reload và xác nhận track vẫn tồn tại.
- [ ] Chỉnh title / genre / language / mood, thêm ảnh bìa (test ảnh <=5 MB).
- [ ] Tạo playlist, thêm/bỏ bài hát.
- [ ] Nghe bài rồi kiểm tra Insights và Daily Mix.
- [ ] Mở trên điện thoại, Add to Home Screen; thử khóa màn hình (kết quả phụ thuộc iOS/Android).

## 9. Tài liệu chính thức

- Next.js static export: https://nextjs.org/docs/app/guides/static-exports
- Cloudflare R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Render Free: https://render.com/docs/free
- Neon pricing: https://neon.com/pricing

## 10. Chuyển từ V1 sang V2

1. **Quan trọng:** V1 và V2 phải chạy dưới cùng một **origin** (cùng protocol + hostname + port) trên đúng trình duyệt đã lưu IndexedDB của V1. Hai path khác nhau dưới cùng origin vẫn truy cập được cơ sở dữ liệu cũ.
2. Sau đăng nhập V2 → Cài đặt → **Chuyển dữ liệu VibeBox V1** → **Kiểm tra V1**. Nếu có nhạc, chọn **Nhập lên server**.
3. App sao chép nhạc V1 vào kho mới, giữ metadata cơ bản (tên, nghệ sĩ, album, thể loại, ngôn ngữ và mood), sau đó chuyển các playlist. Mã ID cũ → mới được lưu cục bộ để retry không upload lại bài đã thành công.
4. Nếu chuyển playlist gặp lỗi giữa chừng, thử lại; lịch sử nghe V1 **không được chuyển** trong bản này. V1 **không bị xóa**. Đối chiếu số file/bộ sưu tập sau khi chuyển.
5. Nếu V1 được mở dưới origin khác (ví dụ chạy local `localhost:8080` mà V2 trên `localhost:3000`), trình duyệt không cho đọc IndexedDB cũ do Same Origin Policy. Trường hợp đó, tải các file gốc lên V2 thủ công.
