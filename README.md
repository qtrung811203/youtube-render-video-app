# Background Video Renderer

Ứng dụng Windows tạo video nền 1080p từ một ảnh tĩnh, audio và subtitle SRT. Mỗi thư mục nguồn phải có ít nhất một ảnh, một `.srt`, và một file audio; nếu có nhiều file cùng loại, chọn file cần dùng trên giao diện.

## Chạy phát triển

1. Cài Node.js 20+ trên Windows.
2. Chạy `npm install`.
3. Chạy `npm run dev`.

## Đóng gói Windows

Chạy `npm run package:win`. Trình cài đặt NSIS sẽ nằm trong thư mục `release/` do electron-builder tạo ra.

## Cách dùng

1. Chọn một hoặc nhiều thư mục nguồn; dùng **Reload** sau khi thêm file còn thiếu.
2. Chọn ảnh/SRT/audio cho từng thư mục nếu cần, sau đó căn ảnh trong preview.
3. Chọn thư mục logo, chỉnh logo, subtitle và nền subtitle. Các thiết lập chung tự được lưu.
4. Chọn mốc preview cùng 5 hoặc 10 giây, tạo preview, rồi nhấn **Render batch MP4**.

Video có tên `ten-thu-muc_render.mp4` được lưu cạnh thư mục nguồn. App sẽ tự thêm số thứ tự nếu tên đó đã tồn tại.
