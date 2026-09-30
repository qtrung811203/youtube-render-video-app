# Background Video Renderer — macOS

Bản Mac dùng chung toàn bộ mã nguồn với bản Windows. Thư mục này chỉ chứa những phần riêng của macOS:

| File | Vai trò |
| --- | --- |
| `Mo-Ung-Dung.command` | Launcher chạy từ mã nguồn (nhấp đúp trong Finder) |
| `entitlements.mac.plist` | Quyền hardened runtime cho Electron và binary FFmpeg đi kèm |
| `package.sh` | Đóng gói `.dmg` (dùng cho cả `npm run package:mac` và GitHub Actions); ký ad-hoc để chạy được trên chip Apple |
| `icon.png` | Icon app (electron-builder tự chuyển sang `.icns`) |

## Tải bản cài đặt

GitHub Actions (`.github/workflows/build-mac.yml`) tự build mỗi lần push lên `main`:

- `…-arm64.dmg` — Mac chip Apple (M1/M2/M3/M4)
- `…-x64.dmg` — Mac chip Intel

Tải trong tab **Actions → Build macOS → Artifacts**, hoặc ở **Releases** khi push tag `v*` (ví dụ `v2.1.0`).

## Mở lần đầu (app chưa ký Apple Developer ID)

macOS sẽ chặn app chưa được ký. Chọn một trong hai cách:

1. Trong Finder, **chuột phải vào app → Open → Open**.
2. Hoặc chạy trong Terminal:
   ```bash
   xattr -cr "/Applications/Background Video Renderer.app"
   ```

## Chạy từ mã nguồn

Cần Node.js 20+. Lần đầu cấp quyền chạy cho launcher, rồi nhấp đúp `Mo-Ung-Dung.command`:

```bash
chmod +x platforms/mac/Mo-Ung-Dung.command
```

Hoặc tự chạy: `npm install && npm run build && npm start`. Đóng gói `.dmg` trên máy Mac: `npm run package:mac`.

## Khác biệt so với Windows

- **Encoder GPU:** Apple VideoToolbox (`h264_videotoolbox`) thay cho NVENC/AMF/QSV. Nếu GPU lỗi, app tự render lại bằng CPU.
- **Font hệ thống:** Apple SD Gothic Neo, AppleMyungjo (Hàn); Hiragino Sans/Mincho/Maru Gothic, YuGothic, YuMincho (Nhật). Các font đóng gói kèm app giống hệt bản Windows.
- **Phím tắt:** Option thay cho Alt (tắt hít cạnh khi kéo), Cmd+C/V trong ô nhập.
- **Quyền truy cập thư mục:** thư mục chọn qua hộp thoại hoặc kéo thả đã được cấp quyền. Khi chọn "Nơi lưu: thư mục khác" trong Desktop/Documents/Downloads, macOS có thể hỏi quyền một lần.
