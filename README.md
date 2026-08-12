# browser-console

ブラウザから PC のシェル（PTY）を操作する軽量コンソール。

設定は実行ファイルと同じディレクトリの `shell.json` だけ。Windows / Linux / macOS 向けポータブル成果物は **GitHub Actions** がビルドし、タグ push で Release に載せます。

## 特徴

- 本物の PTY（Windows は ConPTY + 同梱 `conpty.dll`）
- Tab 補完 / Ctrl+C / 矢印キーがそのまま使える
- 枠なし全画面 xterm.js
- フォントは `shell.json` の `ui` で変更（既定は等幅: Consolas → Cascadia Mono → MS Gothic → BIZ UDGothic）
- 起動は `browser-console.exe`（Windows）または各 OS のランチャー。**START.bat は不要**

## 使い方（Release の zip）

1. [Releases](https://github.com/toyfer/browser-console/releases) から OS 用 zip を落とす
2. **フォルダごと**展開する（中身だけ抜き出さない）
3. 起動
   - **Windows:** `browser-console.exe`
   - **Linux / macOS:** `./browser-console`
4. ブラウザで `http://127.0.0.1:8080`（`openBrowser: true` なら自動）

### フォルダ構成（崩さない）

```
browser-console.exe          # or ./browser-console
shell.json
runtime/node(.exe)           # portable Node
app/app.cjs
app/node_modules/...         # ConPTY / node-pty 含む — 削除禁止
```

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

| フィールド | 説明 |
|---|---|
| `shell` | シェルの**絶対パス**（必須） |
| `shellArgs` | 引数配列 |
| `cwd` | 起動ディレクトリ。`null` ならプロセス cwd |
| `server.host` / `port` | バインド。既定 `127.0.0.1:8080` |
| `server.openBrowser` | 起動時にブラウザを開くか |
| `ui.fontFamily` | **先頭は必ず等幅**（游ゴシック等を先頭にすると幅が崩れる） |
| `ui.fontSize` / `lineHeight` | サイズ・行高 |

探索順: 実行 cwd → `shell.json` / `shell.config.json` / `config.json`

### OS 別の shell 例

- Windows PowerShell: `C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
- Windows cmd: `C:\\Windows\\System32\\cmd.exe`
- Git Bash: `C:\\Program Files\\Git\\bin\\bash.exe` + `shellArgs: ["--login","-i"]`
- Linux: `/bin/bash` + `["-l"]`
- macOS: `/bin/zsh` + `["-l"]`

同梱の `shell.windows.json` / `shell.linux.json` / `shell.macos.json` を `shell.json` にリネームして使えます。

## 操作

| キー | 動作 |
|---|---|
| Tab | 補完 |
| Ctrl+C | 中断（PTY に `\\x03`） |
| 矢印 | 履歴・カーソル |
| Ctrl+Shift+C | コピー（選択時） |
| Ctrl+Shift+V | ペースト |

## 開発

```bash
npm install
npx tsx src/main.ts
# → http://127.0.0.1:8080
```

```bash
# app バンドルのみ
npm run build:app
```

## Release（GitHub Actions）

タグを push すると Actions が OS 別 zip をビルドし、GitHub Release にアップロードします。

```bash
git tag v1.3.0
git push origin v1.3.0
```

ワークフロー: [`.github/workflows/release.yml`](.github/workflows/release.yml)

- `windows-latest` … ConPTY 同梱の Windows zip + 小さな起動 exe
- `ubuntu-latest` … Linux x64 zip
- `macos-latest` … macOS arm64 zip

## 技術

- Backend: Node `http` + `ws` + [`@homebridge/node-pty-prebuilt-multiarch`](https://www.npmjs.com/package/@homebridge/node-pty-prebuilt-multiarch)
- Frontend: [@xterm/xterm](https://xtermjs.org/) 5.5 + Fit / Unicode11 / WebLinks（CDN）
- Windows: `useConpty` + `useConptyDll`（同梱 conpty.dll）、失敗時 winpty フォールバック
- xterm `windowsPty` は Windows ホストのときだけ設定（カーソル位置ヒューリスティック）

## セキュリティ

- 既定バインドは `127.0.0.1`（ローカルのみ）
- シェルは設定ファイルのパスを `spawn` するだけ（シェルインジェクション用に `exec` しない）
- インターネット公開する場合はリバースプロキシ認証などを自分で付けてください

## License

MIT
