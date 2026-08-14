# browser-console

ブラウザから PC のシェル（PTY）を操作する軽量コンソール。

設定は実行ファイルと同じディレクトリの **`shell.json` だけ**。Windows / Linux / macOS 向けポータブル成果物は **GitHub Actions** がビルドし、**タグ push で Release に載せます**。

**START.bat はありません。** Windows は小さな `browser-console.exe` ランチャーだけです。

フロントの xterm.js は **成果物に同梱**します。CDN は使いません。Release を展開したマシンは **インターネット無し（エアギャップ）でも** `http://127.0.0.1:8080` が動きます。

## リポジトリ

https://github.com/toyfer/browser-console

## 特徴

- 本物の PTY（Windows は ConPTY + 同梱 `conpty.dll`）
- Tab 補完 / Ctrl+C / 矢印キー
- 枠なし全画面 xterm.js（ローカル配信）
- フォントは `shell.json` の `ui` で変更（既定は等幅）
- 起動: Windows `browser-console.exe` / Unix `./browser-console`
- 閉域 / エアギャップ対応（実行時に外部通信しない）

## 使い方（Release の成果物）

1. [Releases](https://github.com/toyfer/browser-console/releases) から OS 用アーカイブを落とす（**ネットのあるマシンで**）
2. **フォルダごと**展開する（中身だけ抜き出さない）
3. 閉域マシンへフォルダごと持ち込む
4. 起動
   - **Windows:** `browser-console.exe`
   - **Linux / macOS:** `./browser-console`
5. ブラウザで `http://127.0.0.1:8080`

### フォルダ構成（崩さない）

```
browser-console.exe   # or ./browser-console
shell.json
runtime/node(.exe)
app/app.cjs
app/public/vendor/    # xterm.css / xterm.js / addons — 削除禁止
app/node_modules/...  # ConPTY / node-pty — 削除禁止
```

`app/public/vendor` を消すと画面が空になります。サーバは立ちますが UI が出ません。

## エアギャップ

実行時に参照するのは次だけです。

- 同梱 `runtime/node`
- 同梱 `app/app.cjs` + `app/node_modules` + `app/public/vendor`
- `shell.json` で指定したローカルシェル
- ブラウザ ↔ `127.0.0.1` の HTTP / WebSocket
- OS に入っている等幅フォント

jsDelivr / npm / 自動更新へのアクセスはありません。

ソースから開発起動する場合は、ネットのある環境で一度 `npm install` してください。`postinstall` が `public/vendor` に xterm をコピーします。その後はオフラインで `npx tsx src/main.ts` できます。

## shell.json

```json
{
  "shell": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  "shellArgs": ["-NoLogo", "-NoExit"],
  "cwd": null,
  "env": { "TERM": "xterm-256color", "COLORTERM": "truecolor" },
  "server": { "host": "127.0.0.1", "port": 8080, "openBrowser": true },
  "pty": { "cols": 120, "rows": 30 },
  "ui": {
    "fontFamily": "Consolas, Cascadia Mono, MS Gothic, BIZ UDGothic, monospace",
    "fontSize": 15,
    "fontWeight": "normal",
    "lineHeight": 1.0,
    "theme": "dark"
  }
}
```

- `shell` … 絶対パス（必須）
- `ui.fontFamily` … **先頭は必ず等幅**（游ゴシック等を先頭にすると幅が崩れる）
- 探索: `shell.json` → `shell.config.json` → `config.json`

テンプレ: `shell.windows.json` / `shell.linux.json` / `shell.macos.json`

## 操作

| キー | 動作 |
|---|---|
| Tab | 補完 |
| Ctrl+C | 中断 |
| Ctrl+Shift+C | コピー（選択時） |
| Ctrl+Shift+V | ペースト |

## 開発

```bash
npm install          # postinstall が public/vendor を作る
npx tsx src/main.ts
# → http://127.0.0.1:8080
```

```bash
npm run vendor:xterm   # public/vendor を作り直す
npm run build:app      # dist/app.cjs
```

## Release（GitHub Actions）

タグを push すると [Release workflow](.github/workflows/release.yml) が:

1. Windows / Linux / macOS でポータブル成果物をビルド（xterm を `app/public/vendor` に同梱）
2. GitHub Release を作成し zip / tar.gz + SHA256SUMS をアップロード

```bash
git clone https://github.com/toyfer/browser-console.git
cd browser-console
git tag v1.3.1
git push origin v1.3.1
```

または GitHub UI: **Actions → Release → Run workflow**（`tag` に `v1.3.1` を入力）。

成果物:

| ファイル | 内容 |
|---|---|
| `browser-console-windows-x64.zip` | Windows x64 + `browser-console.exe` |
| `browser-console-linux-x64.tar.gz` | Linux x64 + `./browser-console` |
| `browser-console-macos-arm64.tar.gz` | macOS arm64 + `./browser-console` |

## 技術

- Backend: Node `http` + `ws` + `@homebridge/node-pty-prebuilt-multiarch`
- Frontend: `@xterm/xterm` 5.5 + Fit / Unicode11 / WebLinks（`app/public/vendor` に同梱。CDN なし）
- Windows: `useConpty` + `useConptyDll`、失敗時 winpty
- xterm `windowsPty` は Windows ホストのときだけ設定

## セキュリティ

- 既定バインド `127.0.0.1`
- シェルは `spawn` のみ（`exec` しない）
- 公開する場合は認証を自分で付けてください

## License

MIT
