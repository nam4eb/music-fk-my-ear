# VibeBox 2.1 — Google Sign-In: nâng cấp từ V2 trên Windows

## 1. Sao chép mã nguồn cập nhật
Giải nén ZIP vào `D:\Project\music-fk-my-ear` và ghi đè **mã nguồn**, không ghi đè `apps/api/.env` hoặc `apps/web/.env.local`. Không xóa volume Postgres / thư mục `.music-uploads`.

## 2. Tạo OAuth Client ID
Tại https://console.cloud.google.com/apis/credentials → OAuth client ID → Web application. Thêm Authorized JavaScript origin `http://localhost:3000`. Thiết lập Audience/Test users nếu project ở Testing. Nếu deploy GitHub Pages, thêm `https://nam4eb.github.io`. Không cần redirect URI với Google Identity Services JavaScript callback.

## 3. Cập nhật API .env
Trong `apps/api/.env`, giữ `PORT`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `STORAGE_DRIVER`. Thêm 2 dòng sau:

```dotenv
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_OWNER_EMAIL=you@gmail.com
```

Xóa `SETUP_TOKEN` nếu muốn; không còn sử dụng. Chỉ email chủ sở hữu do mày xác định được chấp nhận. Giữ biến `GOOGLE_CLIENT_ID` ở backend; frontend lấy Client ID công khai qua `/api/config`.

## 4. Nâng cấp DB và chạy
Từ PowerShell, thư mục gốc dự án:

```powershell
docker compose up -d db
Get-Content apps/api/sql/001_init.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U vibebox -d vibebox
Get-Content apps/api/sql/002_google_owner_auth.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U vibebox -d vibebox
npm install
npm run build:core
npm run build:api
npm run build:web
```

Sau đó chạy API và Web trong hai cửa sổ PowerShell:

```powershell
# Terminal 1
npm run dev:api
# Terminal 2
npm run dev:web
```

Mở `http://localhost:3000` → **Continue with Google** → chọn tài khoản `GOOGLE_OWNER_EMAIL`. Không cần setup token. Nếu từng tạo owner bằng email trùng nhau, migration **không sửa `users.id`** và mọi track/playlist/history gắn owner cũ vẫn còn. Nếu email cũ khác, hệ thống trả 403, không tự chiếm hoặc chuyển quyền dữ liệu.

## 5. Kiểm tra
- `http://localhost:4000/health` trả `ok: true`.
- `http://localhost:4000/api/config` trả `googleClientId` và `needsSetup`.
- Google owner đăng nhập được; Google account khác bị 403.
- Upload và nghe 1 MP3, reload kiểm tra dữ liệu vẫn còn.
- Đăng xuất rồi đăng nhập lại.

**Nếu muốn vô hiệu hóa JWT cũ** (7 ngày), đổi `JWT_SECRET` thành chuỗi ngẫu nhiên mới >=32 ký tự. Người dùng đang đăng nhập cần đăng nhập lại. Không chia sẻ Client Secret/ID Token/JWT/.env.
