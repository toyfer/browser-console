export interface UiOpts {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
  theme: "dark" | "light";
  shell?: string;
  ptyBackend?: "conpty" | "winpty" | "unix" | "none";
  winBuildNumber?: number;
}

const DEFAULT_UI: UiOpts = {
  fontFamily: 'Consolas, "Cascadia Mono", "MS Gothic", "BIZ UDGothic", monospace',
  fontSize: 15,
  fontWeight: "normal",
  lineHeight: 1.0,
  theme: "dark",
};

export function buildIndexHtml(ui: Partial<UiOpts> = {}): string {
  const o: UiOpts = { ...DEFAULT_UI, ...ui };
  const bg = o.theme === "light" ? "#ffffff" : "#0c0c0c";
  const fg = o.theme === "light" ? "#1e1e1e" : "#cccccc";
  const cursor = o.theme === "light" ? "#1e1e1e" : "#cccccc";
  const sel = o.theme === "light" ? "#add6ff" : "#264f78";

  const isWinConpty = o.ptyBackend === "conpty";
  const isWinWinpty = o.ptyBackend === "winpty";
  const winBuild = o.winBuildNumber && o.winBuildNumber > 0 ? o.winBuildNumber : 22621;

  let windowsPtyJs = "undefined";
  if (isWinConpty) {
    windowsPtyJs = `{ backend: 'conpty', buildNumber: ${winBuild} }`;
  } else if (isWinWinpty) {
    windowsPtyJs = `{ backend: 'winpty', buildNumber: ${winBuild} }`;
  }

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Console</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css" />
<style>
  html, body {
    margin: 0; padding: 0; height: 100%; width: 100%;
    overflow: hidden; background: ${bg};
  }
  #terminal {
    position: absolute; inset: 0;
    padding: 0 0 0 2px;
    box-sizing: border-box;
  }
  .xterm, .xterm-viewport, .xterm-screen { height: 100%; }
  .xterm-viewport { overflow-y: auto !important; }
  .xterm {
    font-variant-ligatures: none;
    font-feature-settings: "liga" 0, "calt" 0;
    text-rendering: geometricPrecision;
  }
</style>
</head>
<body>
<div id="terminal"></div>
<script type="importmap">
{
  "imports": {
    "@xterm/xterm": "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/+esm",
    "@xterm/addon-fit": "https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/+esm",
    "@xterm/addon-web-links": "https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/+esm",
    "@xterm/addon-unicode11": "https://cdn.jsdelivr.net/npm/@xterm/addon-unicode11@0.8.0/+esm"
  }
}
</script>
<script type="module">
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';

const BOOT = {
  fontFamily: ${JSON.stringify(o.fontFamily)},
  fontSize: ${JSON.stringify(o.fontSize)},
  fontWeight: ${JSON.stringify(o.fontWeight)},
  lineHeight: ${JSON.stringify(o.lineHeight)},
  windowsPty: ${windowsPtyJs},
  theme: {
    background: ${JSON.stringify(bg)},
    foreground: ${JSON.stringify(fg)},
    cursor: ${JSON.stringify(cursor)},
    cursorAccent: ${JSON.stringify(bg)},
    selectionBackground: ${JSON.stringify(sel)},
    black: '#0c0c0c', red: '#c50f1f', green: '#13a10e', yellow: '#c19c00',
    blue: '#0037da', magenta: '#881798', cyan: '#3a96dd', white: '#cccccc',
    brightBlack: '#767676', brightRed: '#e74856', brightGreen: '#16c60c',
    brightYellow: '#f9f1a5', brightBlue: '#3b78ff', brightMagenta: '#b4009e',
    brightCyan: '#61d6d6', brightWhite: '#f2f2f2',
  }
};

try {
  const r = await fetch('/api/ui', { cache: 'no-store' });
  if (r.ok) {
    const j = await r.json();
    if (j.fontFamily) BOOT.fontFamily = j.fontFamily;
    if (typeof j.fontSize === 'number' && j.fontSize > 0) BOOT.fontSize = j.fontSize;
    if (j.fontWeight) BOOT.fontWeight = j.fontWeight;
    if (typeof j.lineHeight === 'number' && j.lineHeight > 0) BOOT.lineHeight = j.lineHeight;
    if (j.ptyBackend === 'conpty' || j.ptyBackend === 'winpty') {
      BOOT.windowsPty = {
        backend: j.ptyBackend,
        buildNumber: (typeof j.winBuildNumber === 'number' && j.winBuildNumber > 0)
          ? j.winBuildNumber : ${winBuild}
      };
    } else if (j.ptyBackend === 'unix' || j.ptyBackend === 'none') {
      BOOT.windowsPty = undefined;
    }
  }
} catch {}

try {
  if (document.fonts) {
    const names = BOOT.fontFamily.split(',').map(s => s.trim().replace(/^["']|["']$/g,'')).filter(Boolean).slice(0, 5);
    await Promise.all(names.map(n => document.fonts.load(BOOT.fontSize + 'px "' + n + '"').catch(() => null)));
    await document.fonts.ready;
  }
} catch {}

const termOptions = {
  fontFamily: BOOT.fontFamily,
  fontSize: BOOT.fontSize,
  fontWeight: BOOT.fontWeight,
  fontWeightBold: 'bold',
  lineHeight: BOOT.lineHeight || 1.0,
  letterSpacing: 0,
  cursorBlink: true,
  cursorStyle: 'block',
  cursorWidth: 1,
  theme: BOOT.theme,
  allowTransparency: false,
  convertEol: false,
  scrollback: 10000,
  macOptionIsMeta: true,
  rightClickSelectsWord: true,
  drawBoldTextInBrightColors: true,
  rescaleOverlappingGlyphs: true,
  allowProposedApi: true,
  smoothScrollDuration: 0,
  ignoreBracketedPasteMode: false,
};

if (BOOT.windowsPty) {
  termOptions.windowsPty = BOOT.windowsPty;
}

const term = new Terminal(termOptions);
const fitAddon = new FitAddon();
const unicode11 = new Unicode11Addon();
term.loadAddon(fitAddon);
term.loadAddon(new WebLinksAddon());
term.loadAddon(unicode11);
try { term.unicode.activeVersion = '11'; } catch (e) { console.warn('unicode11', e); }

const host = document.getElementById('terminal');
term.open(host);

let ws = null;
let reconnectTimer = null;
let lastSent = { cols: 0, rows: 0 };
let resizeTimer = null;

function propose() {
  let dims = null;
  try { dims = fitAddon.proposeDimensions(); } catch {}
  try { fitAddon.fit(); } catch {}
  const cols = Math.max(2, (dims && dims.cols) || term.cols || 0);
  const rows = Math.max(1, (dims && dims.rows) || term.rows || 0);
  return { cols: cols | 0, rows: rows | 0 };
}

function sendResize(force) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const size = propose();
  if (size.cols < 20 || size.rows < 5) return;
  if (size.cols > 500 || size.rows > 200) return;
  if (!force && size.cols === lastSent.cols && size.rows === lastSent.rows) return;
  lastSent = size;
  try {
    ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
  } catch {}
}

function scheduleResize(force) {
  clearTimeout(resizeTimer);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resizeTimer = setTimeout(() => sendResize(!!force), 80);
    });
  });
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(proto + '//' + location.host);
  socket.binaryType = 'arraybuffer';
  ws = socket;

  socket.onopen = () => {
    lastSent = { cols: 0, rows: 0 };
    scheduleResize(true);
    setTimeout(() => scheduleResize(true), 150);
    setTimeout(() => scheduleResize(true), 500);
  };

  socket.onmessage = (ev) => {
    let msg;
    try {
      const text = typeof ev.data === 'string' ? ev.data : new TextDecoder('utf-8').decode(ev.data);
      msg = JSON.parse(text);
    } catch {
      const t = typeof ev.data === 'string' ? ev.data : new TextDecoder('utf-8').decode(ev.data);
      term.write(t);
      return;
    }
    if (msg.type === 'output') {
      term.write(msg.data);
    } else if (msg.type === 'connected') {
      if (msg.pty === false) {
        term.writeln('\\r\\n\\x1b[33m[warn] PTY disabled — Tab / Ctrl+C may not work\\x1b[0m');
      }
      if (msg.ui && (msg.ui.ptyBackend === 'conpty' || msg.ui.ptyBackend === 'winpty')) {
        try {
          term.options.windowsPty = {
            backend: msg.ui.ptyBackend,
            buildNumber: msg.ui.winBuildNumber || ${winBuild}
          };
        } catch {}
      }
      scheduleResize(true);
    } else if (msg.type === 'exit') {
      term.writeln('\\r\\n\\x1b[31m[exit ' + msg.code + ']\\x1b[0m');
    }
  };

  socket.onclose = () => {
    if (ws === socket) ws = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1200);
  };

  socket.onerror = () => {};
}

term.onData((data) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data }));
  }
});

term.onBinary((data) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data }));
  }
});

term.attachCustomKeyEventHandler((e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'c' || e.key === 'C')) {
    if (e.shiftKey || (e.metaKey && !e.ctrlKey)) {
      if (term.hasSelection()) {
        const selText = term.getSelection();
        if (selText) navigator.clipboard.writeText(selText);
        return false;
      }
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
    navigator.clipboard.readText().then((t) => {
      if (t && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: t }));
      }
    });
    return false;
  }
  return true;
});

if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => scheduleResize(false));
  ro.observe(host);
}
window.addEventListener('resize', () => scheduleResize(false));

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleResize(true);
});

propose();
term.focus();
connect();
document.addEventListener('mousedown', () => term.focus());
</script>
</body>
</html>`;
}

export const EMBEDDED_INDEX_HTML = buildIndexHtml();
