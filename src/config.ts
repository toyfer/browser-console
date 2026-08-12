import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface ShellConfig {
  shell: string;
  shellArgs: string[];
  cwd: string | null;
  env: Record<string, string>;
  server: {
    host: string;
    port: number;
    openBrowser: boolean;
  };
  pty: {
    cols: number;
    rows: number;
  };
  ui: {
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    lineHeight: number;
    theme: "dark" | "light";
  };
}

const CANDIDATES = ["shell.json", "shell.config.json", "config.json"];

const DEFAULT_FONT =
  'Consolas, "Cascadia Mono", "MS Gothic", "BIZ UDGothic", monospace';

export function getBinaryDir(): string {
  const candidates = [
    process.cwd(),
    path.dirname(process.execPath),
    path.dirname(process.argv[1] || process.cwd()),
  ];
  for (const dir of candidates) {
    for (const name of CANDIDATES) {
      if (fs.existsSync(path.join(dir, name))) return dir;
    }
  }
  const parent = path.dirname(process.cwd());
  for (const name of CANDIDATES) {
    if (fs.existsSync(path.join(parent, name))) return parent;
  }
  return process.cwd();
}

export function resolveConfigPath(binaryDir?: string): string | null {
  const dir = binaryDir ?? getBinaryDir();
  for (const name of CANDIDATES) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  const scriptDir = path.dirname(process.argv[1] || process.cwd());
  for (const base of [scriptDir, path.join(scriptDir, ".."), process.cwd(), path.join(process.cwd(), "..")]) {
    for (const name of CANDIDATES) {
      const p = path.join(base, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

export function loadConfig(configPath?: string): ShellConfig {
  const resolved = configPath ?? resolveConfigPath();
  if (!resolved) {
    console.error("[config] 設定ファイルが見つかりません。");
    console.error("  shell.json を実行ファイルと同じディレクトリに配置してください。");
    process.exit(1);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolved, "utf-8");
  } catch (e: any) {
    console.error(`[config] 読み込み失敗: ${resolved} - ${e.message}`);
    process.exit(1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    console.error(`[config] JSONパースエラー: ${resolved} - ${e.message}`);
    process.exit(1);
  }

  const platform = os.platform();
  const defaultShell =
    platform === "win32"
      ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
      : "/bin/bash";

  const ui = parsed.ui && typeof parsed.ui === "object" ? parsed.ui : {};

  const cfg: ShellConfig = {
    shell: typeof parsed.shell === "string" ? parsed.shell : defaultShell,
    shellArgs: Array.isArray(parsed.shellArgs) ? parsed.shellArgs : [],
    cwd: typeof parsed.cwd === "string" ? parsed.cwd : null,
    env: typeof parsed.env === "object" && parsed.env !== null ? parsed.env : {},
    server: {
      host: typeof parsed.server?.host === "string" ? parsed.server.host : "127.0.0.1",
      port: typeof parsed.server?.port === "number" ? parsed.server.port : 8080,
      openBrowser: typeof parsed.server?.openBrowser === "boolean" ? parsed.server.openBrowser : false,
    },
    pty: {
      cols: typeof parsed.pty?.cols === "number" ? parsed.pty.cols : 120,
      rows: typeof parsed.pty?.rows === "number" ? parsed.pty.rows : 30,
    },
    ui: {
      fontFamily: typeof ui.fontFamily === "string" ? ui.fontFamily : DEFAULT_FONT,
      fontSize: typeof ui.fontSize === "number" ? ui.fontSize : 15,
      fontWeight: typeof ui.fontWeight === "string" ? ui.fontWeight : "normal",
      lineHeight: typeof ui.lineHeight === "number" ? ui.lineHeight : 1.0,
      theme: ui.theme === "light" ? "light" : "dark",
    },
  };

  if (!cfg.shell) {
    console.error(`[config] shell フィールドが空です: ${resolved}`);
    process.exit(1);
  }

  if (!fs.existsSync(cfg.shell)) {
    console.error(`[config] 指定されたシェルが存在しません: ${cfg.shell}`);
    console.error(`  config: ${resolved}`);
    process.exit(1);
  }

  if (cfg.cwd && !fs.existsSync(cfg.cwd)) {
    console.error(`[config] cwd が存在しません: ${cfg.cwd}`);
    process.exit(1);
  }

  console.log(`[config] loaded: ${resolved}`);
  console.log(`[config] shell: ${cfg.shell} ${cfg.shellArgs.join(" ")}`);
  console.log(`[config] cwd: ${cfg.cwd ?? "(process cwd)"}`);
  console.log(`[config] font: ${cfg.ui.fontFamily} ${cfg.ui.fontSize}px`);
  console.log(`[config] server: http://${cfg.server.host}:${cfg.server.port}`);

  return cfg;
}

export function publicUiConfig(cfg: ShellConfig) {
  return {
    fontFamily: cfg.ui.fontFamily,
    fontSize: cfg.ui.fontSize,
    fontWeight: cfg.ui.fontWeight,
    lineHeight: cfg.ui.lineHeight,
    theme: cfg.ui.theme,
    shell: cfg.shell,
  };
}
