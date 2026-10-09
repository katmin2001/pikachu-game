# ⚡ Game Pikachu

Game xếp hình Pikachu kinh điển: nối 2 ô giống nhau bằng đường gấp khúc
tối đa 2 lần để ăn điểm. Web tĩnh (HTML + CSS + JS thuần), không cần build,
deploy được ngay lên GitHub Pages.

## Chạy thử trên máy

Cách 1: mở trực tiếp file `index.html` bằng trình duyệt.

Cách 2 (khuyên dùng): chạy server tĩnh trong thư mục này:

```bash
cd pikachu-game
python3 -m http.server 8000
```

Rồi mở http://localhost:8000

> Hình Pokemon được tải từ PokeAPI (sprites công khai), nên cần mạng khi chơi.

## Deploy lên GitHub Pages

```bash
cd pikachu-game
git init
git add .
git commit -m "Game Pikachu"
git branch -M main
git remote add origin https://github.com/<tên-user>/<tên-repo>.git
git push -u origin main
```

Sau đó trên GitHub: vào **Settings → Pages → Build and deployment**,
chọn **Deploy from a branch**, branch `main`, thư mục `/ (root)` → **Save**.
Vài phút sau game sẽ chạy tại `https://<tên-user>.github.io/<tên-repo>/`.

## Tính năng

- 3 độ khó: Dễ / Thường / Khó (ảnh hưởng thời gian mỗi màn)
- 2 chế độ chơi: ⏱ Tính giờ và 🌿 Thư giãn (không giới hạn thời gian)
- **Combo nhân điểm**: ăn cặp liên tiếp trong 4 giây để nhân điểm tới x8
- 5 màn chơi tăng dần (6×8 → 12×14), từ màn 6 trở đi giữ 14×14
- Thuật toán nối chuẩn: đường thẳng / gấp 1 lần / gấp 2 lần, vẽ đường nối khi ăn
- Hiệu ứng tia lửa + chữ điểm bay lên khi ăn cặp, ô hiện dần khi vào màn
- Đồng hồ đếm ngược, cảnh báo đỏ khi sắp hết giờ
- Gợi ý (3 lần/màn), tạm dừng, bật/tắt âm thanh và nhạc nền
- **Nhạc nền** chiptune vui nhộn bằng Web Audio (không cần file nhạc)
- Hết nước đi tự động xáo bài cho chơi tiếp, chỉ hết giờ mới thua
- Lưu điểm, màn chơi, chế độ và kỷ lục vào trình duyệt, mở lại có nút chơi tiếp
- **PWA**: cài như app trên điện thoại, có icon riêng, chơi offline nhờ Service Worker
- Giao diện responsive, chơi được trên điện thoại

## Cài như app trên điện thoại (PWA)

1. Deploy game lên GitHub Pages (hoặc bất kỳ host HTTPS nào)
2. Mở link game trên Chrome (Android) → menu ⋮ → **Thêm vào Màn hình chính**
   (trên iPhone: nút Chia sẻ → **Thêm vào MH chính**)
3. Mở từ icon ngoài màn hình chính để chơi ở chế độ app, có thể chơi offline
   sau lần tải đầu tiên (hình Pokemon được cache tự động)

> Lưu ý: Service Worker chỉ chạy trên `https://` hoặc `localhost`, không chạy
> khi mở file `index.html` trực tiếp bằng `file://`.
