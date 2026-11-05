# GYM CHALLENGE — Tập đều, không bỏ cuộc

- **App:** https://tks-gym.github.io/
- **Admin:** https://tks-gym.github.io/admin

Ứng dụng web cho nhóm tập gym: check-in mỗi ngày, báo vắng có lý do, tự tính phạt, ví cá nhân, quỹ nhóm, xếp hạng, báo cáo tháng.

- **Frontend:** React + Vite, hosting miễn phí trên GitHub Pages (PWA, cài được lên màn hình chính).
- **Database:** Supabase Free (PostgreSQL). Mọi thao tác ghi đi qua hàm SQL `SECURITY DEFINER`; bảng khóa bằng RLS.
- **Tính phạt tự động:** `pg_cron` chạy mỗi giờ, kèm cơ chế xử lý bù mỗi lần có người mở app. Hàm idempotent, có khóa chống chạy trùng.

## Luật chơi

| Trường hợp | Kết quả |
|---|---|
| Check-in "Tôi đã tập hôm nay" | Không mất tiền, cộng buổi và chuỗi |
| Báo vắng (Công việc / Về quê / Bị bệnh / Khác + nội dung) | Miễn 100%, không cần duyệt |
| Hết ngày mà không check-in, không báo lý do | Phạt `50.000đ` (đổi được trong Cài đặt), trừ ví, cộng vào quỹ |
| Chủ nhật, ngày nghỉ lễ | Không phạt |

- Chỉ check-in hoặc báo vắng cho **hôm nay** (giờ Asia/Ho_Chi_Minh). Không báo lý do cho ngày đã qua được.
- Trong ngày được đổi qua lại giữa "đã tập" và "vắng". Mọi lần đổi đều lưu lịch sử, và chỉ trạng thái cuối cùng có hiệu lực.
- Ví không đủ tiền thì khoản phạt thành **nợ phạt**. Khi Admin xác nhận nạp tiền, hệ thống tự trả nợ theo thứ tự ngày cũ nhất trước.
- Tài khoản bị **khóa** được xem là tạm dừng: không đăng nhập được và không bị phạt.
- Sổ giao dịch không cho sửa hoặc xóa. Muốn điều chỉnh thì tạo giao dịch mới có ghi chú, và thao tác được lưu vào nhật ký.

## Cấu trúc

```
supabase/migrations/001_gym_challenge.sql   # toàn bộ schema, RLS, hàm nghiệp vụ, pg_cron
supabase/tests/                              # 95 kiểm thử luật chơi + đồng thời (chạy trong CI)
src/                                         # ứng dụng React
.github/workflows/deploy.yml                 # test DB → build → deploy Pages (mỗi lần push main)
.github/workflows/backup.yml                 # sao lưu DB hằng tuần (tùy chọn)
```

## Cài đặt (1 lần)

1. **Supabase:** tạo project → **SQL Editor** → lần lượt dán và chạy từng file trong `supabase/migrations/` theo thứ tự `001`, `002`, `003`… (mỗi file an toàn khi chạy lại).
2. **Tạo Admin:** Authentication → Users → **Add user** (email + mật khẩu do bạn tự đặt, tick *Auto Confirm*). Sau đó chạy trong SQL Editor:
   ```sql
   select public.bootstrap_admin('email-cua-ban@example.com');
   ```
   Mật khẩu Admin chỉ nằm trong Supabase Auth, không có trong mã nguồn.
3. **Tắt đăng ký công khai:** Authentication → Sign In / Providers → tắt *Allow new users to sign up*.
4. **GitHub:** Settings → Secrets and variables → Actions → **Variables**: thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (anon key vốn được thiết kế để công khai). Settings → Pages → Source: **GitHub Actions**.
5. Push lên `main`. Workflow sẽ kiểm thử, build và deploy.

Không bao giờ đưa `service_role` key vào repo hoặc biến môi trường của frontend.

## Sử dụng

- **Thành viên:** mở link → chọn tên → lần đầu tự tạo PIN 4–6 số → bấm **TÔI ĐÃ TẬP HÔM NAY** sau mỗi buổi tập, hoặc **HÔM NAY TÔI KHÔNG THỂ TẬP**. Nạp tiền: chuyển khoản cho Admin rồi gửi yêu cầu trong mục *Tài chính*.
- **Thành viên mới:** màn hình đăng nhập → *Tham gia nhóm* → nhập mã mời (Admin xem ở Cài đặt). Quên PIN: *Quên PIN?* → nhập mã khôi phục.
- **Admin:** `https://tks-gym.github.io/admin` → xác nhận nạp tiền, thêm/khóa/xóa thành viên, đặt lại PIN, đổi mức phạt, ngày tập, giờ check-in, ngày nghỉ lễ, miễn phạt có lý do, chốt tháng, xuất Excel/PDF, tải bản sao lưu JSON.

## Kiểm thử cục bộ

```bash
PGHOST=... PGUSER=postgres npm run test:db
```
