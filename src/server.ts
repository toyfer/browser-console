import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type { ShellConfig } from "./config.js";
import { publicUiConfig } from "./config.js";
import { createPty, isPtyAvailable, getPtyBackend, getWinBuildNumber } from "./pty.js";
import { buildIndexHtml } from "./embedded.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function moduleDir(): string {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return path.dirname(process.argv[1] || process.cwd());
  }
}

function getPublicDir(): string | null {
  const candidates = [
    path.join(process.cwd(), "public"),
    path.join(path.dirname(process.execPath), "public"),
    path.join(path.dirname(process.argv[1] || ""), "public"),
    path.join(path.dirname(process.argv[1] || ""), "..", "public"),
    path.join(moduleDir(), "public"),
    path.join(moduleDir(), "..", "public"),
    path.join(moduleDir(), "..", "..", "public"),
  ];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    try {
      if (fs.existsSync(path.join(c, "vendor", "xterm.js"))) return path.resolve(c);
    } catch {
      /* ignore */
    }
  }
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return path.resolve(c);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function resolvePublicFile(publicDir: string, urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  rel = rel.split("?")[0].replace(/^[/\\]+/, "");
  if (!rel || rel.includes("\0")) return null;
  const resolved = path.resolve(publicDir, rel);
  const root = path.resolve(publicDir);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(prefix)) return null;
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  } catch {
    return null;
  }
  return null;
}

export function startServer(config: ShellConfig): http.Server {
  const winBuild = getWinBuildNumber();
  const publicDir = getPublicDir();
  if (publicDir) {
    console.log(`[static] public: ${publicDir}`);
  } else {
    console.warn("[static] public/vendor not found — UI will fail offline. Run npm install (or npm run vendor:xterm).");
  }

  const uiBase = () => {
    const base = publicUiConfig(config);
    return {
      ...base,
      ptyBackend: getPtyBackend(),
      winBuildNumber: winBuild,
    };
  };

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");

    let urlPath = req.url ?? "/";
    if (urlPath.includes("?")) urlPath = urlPath.split("?")[0];
    if (urlPath === "/") urlPath = "/index.html";

    if (urlPath === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          pid: process.pid,
          shell: config.shell,
          pty: isPtyAvailable(),
          backend: getPtyBackend(),
          winBuildNumber: winBuild,
          publicDir: publicDir ?? null,
        })
      );
      return;
    }

    if (urlPath === "/api/ui") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(uiBase()));
      return;
    }

    if (urlPath === "/index.html" || urlPath === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildIndexHtml(uiBase()));
      return;
    }

    if (publicDir) {
      const filePath = resolvePublicFile(publicDir, urlPath);
      if (filePath) {
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found - " + req.url);
  });

  const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 * 1024 });

  wss.on("connection", (ws: WebSocket) => {
    console.log(`[ws] client connected (${wss.clients.size}) pty=${isPtyAvailable()}`);

    let currentCols = Math.max(20, config.pty.cols || 120);
    let currentRows = Math.max(5, config.pty.rows || 30);
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    let pending: string[] = [];
    let flushing = false;

    const flush = () => {
      if (flushing || closed) return;
      flushing = true;
      while (pending.length && ws.readyState === WebSocket.OPEN) {
        const chunk = pending.shift()!;
        try {
          if (ws.bufferedAmount > 1_000_000) {
            pending.unshift(chunk);
            setTimeout(() => {
              flushing = false;
              flush();
            }, 20);
            return;
          }
          ws.send(JSON.stringify({ type: "output", data: chunk }));
        } catch {
          break;
        }
      }
      flushing = false;
    };

    const pty = createPty(
      config,
      (data) => {
        if (closed || ws.readyState !== WebSocket.OPEN) return;
        pending.push(data);
        flush();
      },
      (code) => {
        if (!closed && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: "exit", code }));
            ws.close();
          } catch {
            /* ignore */
          }
        }
        console.log(`[pty] exit code=${code}`);
      }
    );

    console.log(`[pty] spawned pid=${pty.pid} backend=${getPtyBackend()}`);

    const applyResize = (cols: number, rows: number) => {
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
      cols = Math.floor(cols);
      rows = Math.floor(rows);
      if (cols < 20 || rows < 5) return;
      if (cols > 400 || rows > 150) return;
      if (cols === currentCols && rows === currentRows) return;
      currentCols = cols;
      currentRows = rows;
      try {
        pty.resize(cols, rows);
        console.log(`[pty] resize ${cols}x${rows}`);
      } catch (e: any) {
        console.warn(`[pty] resize error: ${e?.message ?? e}`);
      }
    };

    try {
      pty.resize(currentCols, currentRows);
    } catch {
      /* ignore */
    }

    ws.on("message", (raw, isBinary) => {
      if (closed) return;
      let text: string;
      try {
        text = isBinary ? Buffer.from(raw as Buffer).toString("utf8") : raw.toString();
      } catch {
        return;
      }

      let msg: any;
      try {
        msg = JSON.parse(text);
      } catch {
        pty.write(text);
        return;
      }

      if (msg.type === "input" && typeof msg.data === "string") {
        pty.write(msg.data);
      } else if (msg.type === "resize") {
        const cols = Number(msg.cols);
        const rows = Number(msg.rows);
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => applyResize(cols, rows), 80);
      } else if (msg.type === "ping") {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: "pong" }));
          } catch {
            /* ignore */
          }
        }
      }
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      pending = [];
      pty.kill();
    };

    ws.on("close", () => {
      console.log("[ws] client disconnected");
      cleanup();
    });

    ws.on("error", (err) => {
      console.error("[ws] error", err.message);
      cleanup();
    });

    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(
          JSON.stringify({
            type: "connected",
            pid: pty.pid,
            shell: config.shell,
            pty: isPtyAvailable(),
            backend: getPtyBackend(),
            ui: uiBase(),
          })
        );
      } catch {
        /* ignore */
      }
    }
  });

  server.listen(config.server.port, config.server.host, () => {
    const addr = `http://${config.server.host}:${config.server.port}`;
    console.log("");
    console.log("========================================");
    console.log(`  Browser Console`);
    console.log(`  URL: ${addr}`);
    console.log(`  Shell: ${config.shell}`);
    console.log(`  PTY: ${isPtyAvailable() ? "enabled" : "FALLBACK"} (${getPtyBackend()})`);
    if (winBuild) console.log(`  WinBuild: ${winBuild}`);
    console.log(`  Font: ${config.ui.fontFamily}`);
    console.log("========================================");
    console.log("");
    console.log("ブラウザで上記URLを開いてください。終了は Ctrl+C");

    if (config.server.openBrowser) {
      const cmd =
        process.platform === "win32"
          ? `cmd /c start "" "${addr}"`
          : process.platform === "darwin"
            ? `open "${addr}"`
            : `xdg-open "${addr}"`;
      import("node:child_process").then(({ exec }) => exec(cmd, () => {}));
    }
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[server] ポート ${config.server.port} は使用中です。shell.json の server.port を変更してください`
      );
    } else {
      console.error(`[server] エラー: ${err.message}`);
    }
    process.exit(1);
  });

  return server;
}
