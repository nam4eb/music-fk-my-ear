# Music Fuq Me 2.2 — Hướng dẫn nâng cấp từ VibeBox 2.1

## Mục tiêu

Thêm chọn nhiều bài nhạc, thêm hàng loạt vào playlist, gỡ hàng loạt khỏi playlist hoặc xóa bài khỏi thư viện. Đổi nhận diện và giao diện sang **Music Fuq Me**, dùng hai màu chủ đạo **#20534A** và **#6AC6BC**. Giữ nguyên Google Sign-In, PostgreSQL, kho nhạc local/R2, playlist và lịch sử nghe.

## Lưu ý quan trọng

- **Không cần migration SQL hoặc thay đổi `.env`**.
- Không chạy `docker compose down -v`, không xóa volume PostgreSQL hay thư mục `.music-uploads`.
- Các khóa và tên cơ sở dữ liệu cũ (`vibebox`) được giữ để tương thích, không đổi tên chúng trong quá trình nâng cấp.
- PATCH không chứa `.env`, không chứa file nhạc, và không chứa database.

## Nâng cấp qua PATCH

1. Dừng `npm run dev:api` và `npm run dev:web` (Ctrl+C trong mỗi Terminal).
2. Giải nén **`Music_Fuq_Me_v2_2_PATCH.zip`** vào thư mục `D:\Project\music-fk-my-ear`, chọn **ghi đè các file trùng tên**. Bên trong ZIP là cấu trúc `apps/`, `docs/`, `README.md`, `package.json`.
3. Kiểm tra trước khi chạy: `apps/api/.env` và `apps/web/.env.local` vẫn giữ nguyên.
4. Mở PowerShell trong thư mục dự án:

```powershell
cd D:\Project\music-fk-my-ear
npm run build:core
npm run build:api
npm run build:web
```

5. Sau khi cả ba build PASS, mở hai Terminal khác nhau:

```powershell
# Terminal A
npm run dev:api

# Terminal B
npm run dev:web
```

6. Mở `http://localhost:3000`, nhấn **Ctrl+Shift+R** để tải lại giao diện và PWA. Nếu điện thoại vẫn hiển thị biểu tượng VibeBox, gỡ shortcut PWA cũ rồi **Add to Home Screen** lần nữa để lấy tên/icon Music Fuq Me.

## Cách dùng chọn nhiều bài

- **Thư viện → checkbox** tại từng hàng, hoặc **Chọn tất cả đang hiển thị** (tính theo bộ lọc tìm kiếm / thể loại / ngôn ngữ / mood).
- **Thêm vào playlist** → chọn playlist hiện có hoặc **Tạo playlist** mới. Bài đã tồn tại trong playlist sẽ được bỏ qua, không tạo bản sao.
- **Gỡ khỏi playlist** chỉ xuất hiện trong chi tiết playlist; thao tác này **không xóa bài khỏi thư viện hay file nhạc**.
- **Xóa bài đã chọn** → hộp xác nhận riêng. Xóa khỏi Thư viện **xóa metadata, liên kết playlist và file nhạc**; không thể hoàn tác. Với 100 bài trở lên phải nhập đúng `DELETE`.
- Nút **Bỏ chọn** xóa các checkbox đã đánh dấu. Thay đổi tab, playlist hoặc bộ lọc sẽ xóa vùng chọn ẩn để tránh xóa nhầm.
- Nếu xóa rất nhiều bài, hệ thống chia request 100 bài/lần, hiển thị tiến độ; khi mạng lỗi có thể có một phần đã xóa. Thư viện được refresh để cập nhật trạng thái thực tế.

## Backend API mới

| Phương thức | Đường dẫn | Mục đích |
| --- | --- | --- |
| POST | `/api/playlists/:id/tracks/bulk` | Thêm mảng `trackIds` vào playlist, giữ thứ tự, bỏ qua trùng |
| DELETE | `/api/playlists/:id/tracks/bulk` | Gỡ mảng `trackIds` khỏi playlist, giữ file gốc |
| DELETE | `/api/tracks/bulk` | Xóa các bài trong Thư viện, rồi dọn file local/R2 |

Body chung: `{"trackIds":["uuid-1","uuid-2"]}` (UUID thực, tối đa 1000 ID cho playlist; tối đa 200 ID cho xóa, frontend chia batch nhỏ hơn). API kiểm tra JWT và quyền sở hữu.

## Checklist thử nhanh (dùng bài thử, không xóa thư viện thật)

1. Tải lại frontend và kiểm tra Google đăng nhập được, tên **music fuq me** và bảng màu mới.
2. Lọc theo ngôn ngữ, chọn 2–3 bài; xác nhận checkbox và số bài đã chọn khớp.
3. Tạo playlist thử, thêm 2–3 bài được chọn; lặp lại cùng các bài và xác nhận không nhân đôi.
4. Trong playlist thử, chọn 1 bài rồi **Gỡ khỏi playlist**; kiểm tra bài vẫn tồn tại trong Thư viện.
5. Chỉ khi đã chuẩn bị **1 bài thử có thể xóa**, thử xóa, kiểm tra bài biến mất khỏi thư viện và playlist liên quan.
6. Kiểm tra bộ phát nhạc, phát/pause/next và Daily Mix còn hoạt động.
7. Không thực hiện xóa hàng loạt 765 bài trong bước smoke test.

## Trạng thái kiểm thử của gói

- TypeScript core compile PASS; 15/15 test lõi + lựa chọn bulk PASS; cú pháp TS/TSX đã kiểm tra.
- Chưa chạy build `Next.js`/`Express` với đầy đủ thư viện trong môi trường tạo gói vì npm registry không khả dụng.
- Chưa thực hiện thử nghiệm tích hợp với PostgreSQL/R2 thực. Build và smoke trên Windows là điều kiện bắt buộc trước khi dùng dữ liệu chính.
