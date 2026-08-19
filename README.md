# GPS Speedometer

Bundle ID: `com.gps.speedometer.app`

## GitHub Actions — 2 nút rõ ràng

| # | Workflow | Khi nào bấm |
|---|---|---|
| **1. Bung ZIP lên repo** | Unzip + commit source | Repo mới, mới upload mỗi file `.zip` |
| **2. Build IPA** | Tự unzip (nếu thiếu) rồi ra `.ipa` | Muốn tải IPA |

### Làm lần đầu

1. Tạo repo GitHub **trống**
2. Upload `GPS-Speedometer-github.zip` (và đừng quên 2 file trong `.github/workflows/` nếu zip chưa bung)
3. **Actions → 1. Bung ZIP lên repo → Run workflow**
4. **Actions → 2. Build IPA → Run workflow**
5. Vào run vừa xong → **Artifacts → GPS-Speedometer.ipa**

IPA **chưa ký**. Cài TrollStore / AltStore / Esign.

`2. Build IPA` vẫn chạy được nếu repo **chỉ có zip** (nó tự bung, không commit).

## Mac + Xcode

```bash
npm ci
npm run build:ios
npx cap sync ios
npx cap open ios
```
