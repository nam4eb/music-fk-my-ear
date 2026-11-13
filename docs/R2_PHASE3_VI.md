# MUSIC FUQ ME 2.3 — PHASE 3: CHUYỂN SANG CLOUDFLARE R2 (HƯỚNG DẪN WINDOWS)

## Phạm vi, nguyên tắc an toàn

- **Không xóa PostgreSQL, volume Docker hoặc các file nhạc local hiện có.**
- R2 private chỉ giữ nhạc/ảnh bìa. PostgreSQL giữ `users`, `tracks`, `playlists`, `listening_events`.
- SQL `003_r2_hybrid_storage.sql` bổ sung `storage_driver` cho từng bài, `cover_storage_driver` cho ảnh và pending upload. Mặc định toàn bộ dữ liệu cũ = `local`.
- Khi bật `STORAGE_DRIVER=r2`, upload mới chuyển sang R2; bài cũ tiếp tục dùng đường dẫn local đã lưu trong DB.
- Script migration chạy **read-only** theo mặc định; `--apply --confirm` mới chuyển từng đối tượng. Sau HEAD/kiểm tra dung lượng + SHA256 metadata (tùy chọn `--verify-download` đối chiếu bytes), script cập nhật đúng một dòng DB. File local không bị xóa.
- KHÔNG chuyển thẳng API lên Render Free rồi tắt máy Windows nếu nhạc cũ chưa được copy đủ lên R2: host mới sẽ không có file local.

## 1. Đăng ký Cloudflare R2

1. Mở https://dash.cloudflare.com/ → **R2 object storage** → kích hoạt R2. Cloudflare có thể yêu cầu thêm phương thức thanh toán và đăng ký R2 dù đang trong free allowance; đây không phải hosting vô điều kiện không cần thanh toán.
2. **Create bucket** tên `music-fuq-me-private` (hoặc tên tùy chọn) → chọn **Standard**, không bật public `r2.dev` hay custom domain public.
3. Mục **R2 > Manage API Tokens** → tạo token **Object Read & Write** giới hạn CHỈ bucket trên. Sao chép **Access Key ID** và **Secret Access Key**. Không dùng token Cloudflare API thông thường thay cho S3 keys.
4. Lấy **S3 API endpoint** tại R2 Overview, thường `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (EU jurisdiction dùng endpoint `.eu.r2...`, US dùng `.us.r2...`).
5. Bucket → **Settings > CORS Policy** → dán `docs/r2-cors.json`. Thay `https://nam4eb.github.io` bằng origin thực tế của web app nếu khác. Origin không kèm path `/repo`, không có `/` cuối. R2 CORS có thể mất một lúc để cập nhật.

Hạn mức R2 Standard miễn phí hiện hành (cần kiểm tra lại ở trang giá khi kích hoạt): 10 GB-tháng, 1 triệu Class A / 10 triệu Class B mỗi tháng; vượt mức có phí. **R2 không phải PostgreSQL**.

## 2. Áp dụng PATCH trên D:\Project\music-fk-my-ear

Mở PowerShell tại project và dừng `npm run dev:api`, `npm run dev:web` trước khi ghi đè mã:

```powershell
cd D:\Project\music-fk-my-ear
Expand-Archive -Path .\Music_Fuq_Me_v2_3_R2_PATCH.zip -DestinationPath . -Force
npm install
```

PATCH không chứa `.env` hoặc file media. Không chạy `docker compose down -v`.

## 3. Database migration (bắt buộc trước khi đổi STORAGE_DRIVER)

```powershell
docker compose up -d db
Get-Content apps/api/sql/003_r2_hybrid_storage.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U vibebox -d vibebox
```

Chỉ chạy trên DB đang có dữ liệu. Nếu PostgreSQL nằm trên Neon hay host khác, dùng SQL Editor hay `psql` kết nối đúng DB. SQL 003 không xóa dữ liệu.

## 4. Cấu hình apps/api/.env

Giữ `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_OWNER_EMAIL` như cũ. Thêm/chỉnh:

```dotenv
STORAGE_DRIVER=r2
LOCAL_STORAGE_DIR=./.music-uploads
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=music-fuq-me-private
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
CORS_ORIGINS=http://localhost:3000
API_PUBLIC_URL=http://localhost:4000
```

**`LOCAL_STORAGE_DIR` không được thay/xóa khi còn bài local.** Chạy `npm run dev:api` từ npm workspace khiến đường dẫn tương đối dựa vào `apps/api`. Nếu chạy API từ root trực tiếp bằng `node apps/api/dist/index.js`, cần dùng đường dẫn tuyệt đối cho `LOCAL_STORAGE_DIR` (ví dụ `D:/Project/music-fk-my-ear/apps/api/.music-uploads`). Không đặt R2 secret trong `apps/web/.env.local`, GitHub repository hay biến `NEXT_PUBLIC_*`.

## 5. Kiểm tra quyền truy cập R2 trước

```powershell
npm run r2:check
```

Lệnh tự tạo object thử tại `diagnostics/`, kiểm tra PUT/HEAD/GET rồi xóa object thử. Phải xuất hiện `PASS` ở các bước. Chỉ kiểm tra credential từ API host; **không** cần đưa secret vào chat.

## 6. Kiểm kê & chuyển nhạc cũ

```powershell
# Trước tiên chạy kiểm kê read-only (không upload, không sửa DB)
npm run r2:migrate

# Pilot 5 đối tượng trước, bao gồm bài hát/ảnh bìa nếu có
npm run r2:migrate -- --limit=5 --apply --confirm --verify-download

# Kiểm tra phát thử các bài đã chuyển và bài chưa chuyển
# Sau khi PASS mới chuyển toàn bộ các object còn lại
npm run r2:migrate -- --apply --confirm --verify-download
```

Chú ý PowerShell: script root `npm run r2:migrate` đã chuyển tiếp tham số tới API workspace; nếu npm phàn nàn cú pháp `--`, dùng trực tiếp:

```powershell
npm run r2:migrate -w @vibebox/api -- --limit=5 --apply --confirm --verify-download
```

Script có thể chạy lại sau khi ngắt mạng; object được so khớp SHA256 và size. Nó chỉ cập nhật DB khi object R2 được xác minh. File local vẫn tồn tại. Nếu phát hiện object trùng key nhưng sai size/hash → lỗi, **không ghi đè**. Nếu gặp lỗi, lưu log và xử lý trước khi chạy lại.

## 7. Kiểm tra trạng thái migration

```powershell
npm run dev:api
Invoke-RestMethod http://localhost:4000/health
```

Sau khi đăng nhập Google, phần Settings → Backend & Storage cho biết số bài `Cloudflare R2` và `Local disk`. API owner-only: `GET /api/storage/status` (cần Bearer JWT). API trả trạng thái theo driver, không tiết lộ object keys hay credentials.

Tiêu chí chấp nhận pilot: (1) 5 objects verified; (2) phát/tua bài R2 được; (3) phát/tua bài local chưa chuyển được; (4) upload mới R2 được; (5) xóa thử **một bài thử nghiệm** xóa đúng R2 object; (6) playlist và lịch sử không mất.

## 8. Chuyển sang host cloud thực tế

- **Frontend Next.js static**: GitHub Pages (`.github/workflows/deploy-pages.yml`); biến repo `NEXT_PUBLIC_API_URL=https://your-api.example.com`. Workflow tự lấy `/${repo_name}` làm base path.
- **Backend Express**: host Node chạy 24/7 hoặc service phù hợp. API phải dùng HTTPS, URL đó đi vào `API_PUBLIC_URL`.
- **PostgreSQL**: Neon/Postgres production; phải di chuyển database hiện có nếu muốn giữ metadata/playlist/history. SQL 001, 002, 003 trên database mới không tự chuyển dữ liệu; cần backup/restore có kiểm tra.
- **R2**: giữ bucket private; credentials chỉ ở host API. Trước khi chuyển host, đảm bảo **không còn tracks/cover_storage_driver=local**, hoặc host mới có đầy đủ media local. Sau deploy cần đổi Google OAuth Authorized JavaScript Origins, CORS_ORIGINS và R2 bucket CORS theo origin HTTPS.

## 9. Phục hồi / rollback

Nếu R2 lỗi: đổi `STORAGE_DRIVER=local` để upload MỚI quay về local và restart API. **Không sửa tay tất cả `storage_driver` thành `local`** — những bài đã chuyển R2 vẫn được đọc từ R2 bằng metadata riêng. Muốn dừng hẳn R2 phải có bản nhạc local cho mọi bài và tiến hành chuyển ngược được xác minh riêng (chưa tự động hóa). Không xóa SQL 003. Tuyệt đối không chạy xóa bucket khi còn bài R2.

Bản lưu trữ an toàn yêu cầu backup PostgreSQL định kỳ, giữ nhạc gốc độc lập, kiểm tra quyền truy cập/usage R2. HTTPS và Google xác thực không biến R2 thành giải pháp backup tuyệt đối.

## 10. Xử lý lỗi nhanh

- `ZodError R2_*`: thiếu biến hoặc endpoint sai; kiểm tra file `apps/api/.env` và restart.
- `403 SignatureDoesNotMatch`: kiểm tra đúng S3 Access Key + Secret, endpoint, bucket, Content-Type khi PUT.
- `403 AccessDenied`: token chưa có Object Read & Write đúng bucket.
- `CORS preflight`: sửa `AllowedOrigins` (không đường dẫn), `AllowedMethods=PUT,GET,HEAD`, `AllowedHeaders=Content-Type,Range`.
- `Upload stored but complete 409`: object size không khớp; kiểm tra mạng, max file, signed URL hết hạn.
- `File not found local`: kiểm tra `LOCAL_STORAGE_DIR` tính theo cwd và giữ nguyên thư mục local khi chuyển hosting.
- `Playback 403` sau một giờ: GET URL đã hết hạn; phát lại để lấy URL mới.
- `npm audit high`: xem `npm audit`, tránh `npm audit fix --force` nếu chưa test regression.

Nguồn chính thức: https://developers.cloudflare.com/r2/get-started/ , https://developers.cloudflare.com/r2/api/tokens/ , https://developers.cloudflare.com/r2/buckets/cors/ , https://developers.cloudflare.com/r2/pricing/ .
