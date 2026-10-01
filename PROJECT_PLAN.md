# Background Video Renderer — Project Plan

## 1. Mục tiêu

Ứng dụng Windows desktop tạo video nền hàng loạt từ từng thư mục nguồn. Mỗi video gồm một ảnh tĩnh, audio, subtitle SRT và tùy chọn logo dùng chung.

Kết quả xuất là MP4 H.264 + AAC, mặc định 1920×1080 30fps (đổi được độ phân giải/FPS/chất lượng); thời lượng video được lấy theo file audio. File kết quả tên `ten-thu-muc_render.mp4` (tự thêm số thứ tự nếu trùng), lưu trong thư mục nguồn, cạnh thư mục nguồn hoặc thư mục tùy chọn.

## 2. Trạng thái hiện tại (v2)

- **Hàng đợi batch (cột trái):** thêm thư mục bằng nút, bằng *Thư mục cha* (mỗi thư mục con = 1 video) hoặc kéo thả; tick chọn thư mục; **▶ Bắt đầu tất cả / ■ Dừng**; render/dừng từng thư mục; tiến độ %, tốc độ ×, thời gian render; mở vị trí video; bỏ qua video đã render.
- **Bộ mã hóa GPU/CPU:** mặc định GPU. App tự dò encoder chạy được (NVIDIA NVENC, AMD AMF, Intel QSV); nếu không có GPU thì dùng CPU (libx264). Nếu GPU lỗi giữa chừng, app tự render lại bằng CPU.
- **Chạy song song** 1–4 video.
- **Editor tự do (giữa):** stage 1920×1080 thật, co giãn theo khung. Bấm để chọn phần tử (ảnh nền / logo / phụ đề); kéo để di chuyển; kéo góc logo để đổi cỡ; kéo cạnh trái/phải khung phụ đề để đổi độ rộng dòng (Shift: đối xứng); cuộn chuột để zoom ảnh / đổi cỡ logo / đổi cỡ chữ; phím mũi tên dịch 1px (Shift: 10px); đường gióng hít vào tâm và mép khung (Alt: tắt).
- **Timeline:** kéo tới mốc bất kỳ, nhảy câu trước/sau; stage hiển thị đúng câu phụ đề tại mốc đó.
- **Preview FFmpeg 5/10/20 giây** hiển thị ngay trong khung (chế độ *Video preview*), có cảnh báo khi preview đã cũ so với cài đặt.
- **Inspector (cột phải):** 3 tab theo phần tử đang chọn. Ảnh nền (riêng từng thư mục, có “Áp dụng cho tất cả”); Logo (thư viện dạng lưới ảnh, 9 vị trí đặt nhanh, opacity, thứ tự lớp); Phụ đề (mẫu nhanh, font hệ thống, đậm/nghiêng, viền, đổ bóng, giãn dòng, căn chữ, nền: Không/Ôm chữ/Toàn ngang, padding, bo góc).
- Khung ảnh của từng thư mục được lưu theo đường dẫn, mở lại thư mục sẽ khôi phục.
- **Cấu hình xuất (cột trái → Xuất video):** độ phân giải 480p/720p/1080p/1440p, FPS 15/24/25/30/60, chất lượng Cao/Cân bằng/Nhỏ gọn (CRF/CQ/QP hoặc bitrate VideoToolbox theo độ phân giải). Editor luôn làm việc ở 1920×1080; FFmpeg scale ảnh nền, logo và từng câu phụ đề một lần (không scale mỗi frame), vị trí nhân theo tỉ lệ.
- **Font đa ngôn ngữ (`src/fonts.ts`, `src/FontPicker.tsx`):** bộ chọn font theo tab Hàn / Nhật / Việt / Máy tính, mỗi dòng xem trước bằng chính câu phụ đề hiện tại. Font đóng gói kèm app (không phụ thuộc máy): Hàn — Noto Sans KR, Nanum Gothic, Gowun Dodum, Noto Serif KR, Nanum Myeongjo, Jua, Do Hyeon, Black Han Sans; Nhật — Noto Sans JP, M PLUS Rounded 1c, Zen Maru Gothic, Kosugi Maru, Noto Serif JP, Shippori Mincho, Sawarabi Mincho, Dela Gothic One; Việt — Be Vietnam Pro, Roboto, Montserrat. Font Windows (Malgun Gothic, Yu Gothic, Meiryo, BIZ UD, Yu Mincho…) chỉ hiện khi máy có cài.
- Font dự phòng chọn theo ngôn ngữ của từng câu (có kana → Nhật, có Hangul → Hàn) để chữ Hán không bị vẽ nhầm kiểu Hàn/Nhật; cảnh báo khi font và ngôn ngữ phụ đề không khớp.
- Ngắt dòng bằng `Intl.Segmenter`: tiếng Nhật ngắt theo từ + quy tắc kinsoku (không mở dòng bằng 、。」…, không kết dòng bằng 「（…), tiếng Hàn giữ nguyên cụm từ (어절).
- Font đóng gói được chia theo unicode-range; trước khi vẽ, app nạp đúng các phần glyph mà câu phụ đề cần (`ensureFonts`).
- `Mo-Ung-Dung.bat` chỉ build lại khi mã nguồn thay đổi (`scripts/ensure-build.mjs`), vì font CJK làm bản build mất ~15 giây; `dist` ~54 MB (Vite plugin trong `vite.config.ts` bỏ file `.woff` dự phòng, chỉ giữ `.woff2`).

## 3. Đầu vào và quy tắc quét thư mục

| Loại | Định dạng hỗ trợ |
| --- | --- |
| Ảnh nền | `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp` |
| Subtitle | `.srt` (UTF-8, UTF-8 BOM, UTF-16) |
| Audio | `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg` |

- Thiếu một trong ba loại sẽ không render được và hiển thị lý do.
- Nhiều file cùng loại: app chọn sẵn file đầu tiên, người dùng đổi ở tab *Ảnh nền*.
- Kéo thả một thư mục không chứa media nhưng có thư mục con → tự quét các thư mục con.
- Audio là mốc thời lượng chính; subtitle hiển thị trong các timecode SRT (câu chồng thời gian được xếp chồng dòng).

## 4. Luồng sử dụng

1. Mở `Mo-Ung-Dung.bat`.
2. Kéo thả thư mục vào cột trái (hoặc **+ Thư mục** / **+ Thư mục cha**).
3. Chọn thư mục, căn ảnh nền trực tiếp trên khung; chọn logo và kiểu phụ đề ở cột phải hoặc kéo thả trên khung.
4. Kéo timeline tới đoạn cần kiểm tra, bấm **Preview FFmpeg** để xem video thật.
5. Chọn GPU/CPU, số video song song, nơi lưu; bấm **▶ Bắt đầu tất cả**.

## 5. Kiến trúc

| Thành phần | Trách nhiệm |
| --- | --- |
| `src/composer.ts` | **Nguồn duy nhất** về hình học và vẽ: crop ảnh nền, vị trí logo, layout/ngắt dòng/vẽ phụ đề, dựng các lớp PNG cho FFmpeg. |
| `src/Stage.tsx` | Editor kéo thả tự do trên stage 1920×1080 (dùng lại composer để vẽ). |
| `src/Inspector.tsx` | Panel thuộc tính theo phần tử đang chọn. |
| `src/App.tsx` | Trạng thái, hàng đợi batch (worker pool), timeline, preview. |
| `src/media.ts` | Đọc ảnh qua IPC thành `blob:` URL (canvas không bị taint), cache ảnh/SRT/thời lượng. |
| `electron/main.ts` | Quét thư mục, parse SRT, dò encoder GPU, ghi job tạm, chạy FFmpeg (song song, hủy, fallback CPU), migrate settings v1. |
| `electron/preload.ts` | Bridge `window.videoRenderer`. |
| `electron/types.ts` | Kiểu dữ liệu và settings mặc định dùng chung cho main + renderer. |

## 6. Render pipeline

1. Renderer đọc SRT + thời lượng audio (FFprobe).
2. Renderer vẽ bằng **cùng hàm với editor**: `bg.png` (ảnh nền đã crop/zoom, kèm logo nếu *Phụ đề trên logo*), `logo.png` (nếu *Logo trên phụ đề*), mỗi câu phụ đề duy nhất thành một PNG trong suốt cùng kích thước dải ngang, cộng `empty.png`.
3. Main ghi danh sách `ffconcat` với thời lượng từng đoạn (mili-giây nguyên, không trôi thời gian).
4. FFmpeg: decode `bg.png` **một lần** → `loop` filter → overlay dải phụ đề → overlay logo → encode NVENC/AMF/QSV/libx264 + AAC 192k.
5. Ghi ra `*.partial.mp4`, đổi tên khi xong; hủy/lỗi thì xóa file dở và thư mục job tạm.
6. Preview dùng đúng pipeline này với `-ss` và dải phụ đề dịch theo mốc.

Vì editor và video dùng chung code vẽ (Chromium canvas), chữ/font/viền/nền/vị trí khớp tới pixel; FFmpeg không còn phụ thuộc libass/fontconfig (bản ffmpeg-static trên Windows không có cấu hình fontconfig nên trước đây font dễ bị thay).

## 7. Chạy và đóng gói

### Điều kiện

- Windows
- Node.js 20+
- Internet ở lần đầu chạy để `npm install` tải dependencies

### Lệnh

```powershell
npm install
npm run build
npm start
```

### Launcher

- `Mo-Ung-Dung.bat`: launcher chính. Tự cài dependencies nếu cần, build rồi mở Electron production.
- `run-dev.bat`: chuyển tiếp về launcher production.
- `npm run dev`: chỉ dành cho phát triển; chạy Vite, TypeScript watch và Electron.
- `npm run package:win`: build và tạo installer NSIS bằng electron-builder.

## 7b. macOS

Dùng chung toàn bộ mã nguồn; phần riêng nằm ở `platforms/mac/` (xem `README-mac.md`).

| Hạng mục | Windows | macOS |
| --- | --- | --- |
| Encoder GPU | NVENC / AMF / QSV | `h264_videotoolbox` (`-b:v 8M -allow_sw 1`) |
| Launcher | `Mo-Ung-Dung.bat` | `platforms/mac/Mo-Ung-Dung.command` |
| Đóng gói | `npm run package:win` (NSIS) | `npm run package:mac` → `platforms/mac/package.sh` (ký ad-hoc + `.dmg`) |
| Menu | mặc định | `appMenu/editMenu/viewMenu/windowMenu` (Cmd+C/V trong ô nhập) |
| Font hệ thống | Malgun Gothic, Yu Gothic, Meiryo… | Apple SD Gothic Neo, AppleMyungjo, Hiragino, YuGothic/YuMincho |

- CI: `.github/workflows/build-mac.yml` build `.dmg` arm64 (`macos-15`) và x64 (`macos-15-intel`) mỗi lần push `main`; tag `v*` đính kèm vào GitHub Release. Có bước kiểm tra binary FFmpeg darwin có VideoToolbox.
- App chưa ký Developer ID: mở lần đầu bằng chuột phải → Open, hoặc `xattr -cr "/Applications/Background Video Renderer.app"`.
- Font và React là `devDependencies` (đã được Vite gom vào `dist`), nên bộ cài không chứa thêm `node_modules` của font.
## 8. Lỗi đã xử lý

### v1 → v2: preview không khớp video

| Triệu chứng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| Ảnh nền lệch sau khi zoom | CSS `scale()` zoom quanh tâm, FFmpeg crop theo tỉ lệ x/y | Một hàm `backgroundRect` dùng cho cả hai |
| Logo lệch nửa kích thước | Preview lấy tâm logo, `overlay` FFmpeg lấy góc trên-trái | Lưu tâm logo, tính rect nguyên pixel dùng chung |
| Chữ khác cỡ/font | Preview chia cỡ chữ cho 3.4; libass không có fontconfig | Vẽ phụ đề bằng canvas, dùng lại khi render |
| Nền “Ôm nội dung” không hiện | ASS `BorderStyle=1` không vẽ hộp nền | Vẽ hộp nền bằng canvas (có bo góc) |
| Opacity nền làm mờ cả chữ (preview) | `opacity` đặt trên cả phần tử | Nền và chữ có opacity riêng |
| Render chậm (~2× realtime) | `-loop 1` decode lại PNG 1080p mỗi frame | Decode một lần + `loop` filter (~3× nhanh hơn), GPU encode |

Settings v1 (`logoPath`, `logoTransform`, `subtitle.vertical`) được tự chuyển sang v2 khi mở app.

### Màn hình trắng / `ERR_FILE_NOT_FOUND` với CSS và JS

Vite dùng asset tuyệt đối; đã đặt `base: './'` trong `vite.config.ts`.

### `window.videoRenderer` undefined

Thường do mở Vite/localhost trong browser. Renderer hiển thị màn hình hướng dẫn; main ghi log tại `%APPDATA%\background-video-renderer\startup.log`.

## 9. Việc cần hoàn thiện / kiểm thử tiếp

- Kiểm thử với audio dài (≥ 1 giờ, hàng nghìn câu SRT) để đo thời gian dựng PNG phụ đề.
- Thêm kiểm thử đơn vị cho `parseSrt`, `buildSegments`, `layoutSubtitle`, tên output tránh ghi đè.
- Thêm Content Security Policy cho renderer trước khi phát hành installer.
- Cân nhắc: lưu danh sách hàng đợi giữa các phiên, lịch sử render, preset phụ đề do người dùng tự lưu.

## 10. Tiêu chí nghiệm thu

- App mở bằng launcher mà không dùng Vite/localhost và không trắng màn hình.
- Chọn/kéo thả được nhiều thư mục, báo đúng tệp còn thiếu và Reload hoạt động.
- Editor và video cuối khớp bố cục ảnh/logo/subtitle (đã đo: chỉ khác anti-alias, không lệch vị trí).
- Batch chạy được bằng GPU và CPU, song song, dừng được, không để lại file dở.
- Output có tên không trùng và chơi được trên Windows.
