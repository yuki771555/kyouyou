# 教養科目シラバス カレンダーUI

神戸大学 電気電子工学科 2026年度 2Q 教養科目のシラバスを、時間割（カレンダー）形式で閲覧できる静的サイトです。

- 月〜金 × 1〜5限のグリッドに配置
- 集中講義は別枠で表示
- カテゴリ（人文系 / 社会系 / 総合系）でフィルタ
- カードクリックで詳細モーダル
- コード・モーダルから公式シラバスページへ直リンク

参照元: <https://kym22-web.ofc.kobe-u.ac.jp/kobe_syllabus/2026/20/>

## ファイル構成

```
.
├─ index.html
├─ style.css
├─ app.js
├─ data/
│   └─ syllabus.md     ← 元データ（更新時はここを差し替えるだけ）
└─ README.md
```

## ローカルでの確認

`fetch` を使うのでファイル直開きでは動かず、ローカルサーバーが必要です。

```bash
cd kyouyou
python -m http.server 8000
```

ブラウザで <http://localhost:8000/> を開いてください。

## GitHub Pages へのデプロイ

1. GitHub でリポジトリを新規作成（例: `kyouyou-syllabus`）
2. このフォルダを push
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-account>/<repo>.git
   git push -u origin main
   ```
3. GitHub のリポジトリ → **Settings** → **Pages**
4. **Source** を `Deploy from a branch`、**Branch** を `main` / `/ (root)` に設定して保存
5. 数十秒後、`https://<your-account>.github.io/<repo>/` で公開されます

## データ更新

`data/syllabus.md` を新しいシラバスのMarkdownで上書きすれば反映されます。
フォーマット規則:

- カテゴリ見出し: `## 📚 教養科目（人文系/社会系/総合系）`
- 講義見出し: `### 科目名｜コード｜教員名｜時限スロット` （全角パイプ区切り）
- 本文の各フィールドは `**授業のテーマ**` のように太字キーで開始
