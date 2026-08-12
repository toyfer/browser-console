import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { ShellConfig } from "./config.js";

export interface PtyHandle {
  pid: number | undefined;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (code: number | null) => void) => void;
}

export type PtyBackend = "conpty" | "winpty" | "unix" | "none";

type PtyMod = {
  spawn: (
    file: string,
    args: string[] | string,
    options: Record<string, unknown>
  ) => {
    pid: number;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    kill: (signal?: string) => void;
    onData: (cb: (data: string) => void) => void;
    onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => void;
  };
};

function getRequire(): NodeRequire {
  try {
    // eslint-disable-next-line no-eval
    const fn = eval("typeof __filename !== 'undefined' ? __filename : null") as string | null;
    if (fn) return createRequire(fn);
  } catch {
    /* ignore */
  }
  try {
    // @ts-expect-error import.meta ESM
    if (typeof import.meta !== "undefined" && import.meta.url) {
      // @ts-expect-error import.meta
      return createRequire(import.meta.url);
    }
  } catch {
    /* ignore */
  }
  return createRequire(path.join(process.cwd(), "package.json"));
}

const req = getRequire();

function tryLoadPty(): PtyMod | null {
  const names = [
    "@homebridge/node-pty-prebuilt-multiarch",
    "node-pty-prebuilt-multiarch",
    "node-pty",
  ];

  for (const name of names) {
    try {
      const mod = req(name);
      if (mod && typeof mod.spawn === "function") {
        console.log(`[pty] loaded: ${name}`);
        return mod as PtyMod;
      }
      if (mod?.default && typeof mod.default.spawn === "function") {
        console.log(`[pty] loaded: ${name} (default)`);
        return mod.default as PtyMod;
      }
    } catch (e: any) {
      console.warn(`[pty] load failed ${name}: ${e?.message ?? e}`);
    }
  }

  const bases = [
    path.dirname(process.execPath),
    process.cwd(),
    path.join(path.dirname(process.execPath), "node_modules"),
    path.join(process.cwd(), "node_modules"),
    path.join(path.dirname(process.execPath), "app", "node_modules"),
    path.join(process.cwd(), "app", "node_modules"),
    path.join(path.dirname(process.argv[1] || ""), "node_modules"),
    path.join(path.dirname(process.argv[1] || ""), "..", "node_modules"),
  ];
  for (const base of bases) {
    for (const name of names) {
      const c = path.join(base, name);
      try {
        if (!fs.existsSync(path.join(c, "package.json"))) continue;
        const mod = req(c);
        if (mod && typeof mod.spawn === "function") {
          console.log(`[pty] loaded path: ${c}`);
          return mod as PtyMod;
        }
      } catch {
        /* next */
      }
    }
  }
  return null;
}

const ptyModule = tryLoadPty();
let activeBackend: PtyBackend = ptyModule
  ? os.platform() === "win32"
    ? "conpty"
    : "unix"
  : "none";

export function isPtyAvailable(): boolean {
  return !!ptyModule;
}

export function getPtyBackend(): PtyBackend {
  return activeBackend;
}

export function getWinBuildNumber(): number {
  if (os.platform() !== "win32") return 0;
  const r = os.release();
  const parts = r.split(".");
  const build = parseInt(parts[2] || "0", 10);
  return Number.isFinite(build) ? build : 0;
}

function buildEnv(config: ShellConfig): { [key: string]: string } {
  const out: { [key: string]: string } = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") out[k] = v;
  }
  for (const [k, v] of Object.entries(config.env || {})) {
    if (typeof v === "string") out[k] = v;
  }
  out.TERM = out.TERM || "xterm-256color";
  out.COLORTERM = out.COLORTERM || "truecolor";
  if (os.platform() === "win32") {
    out.TERM_PROGRAM = out.TERM_PROGRAM || "browser-console";
  }
  return out;
}

export function createPty(
  config: ShellConfig,
  onData: (d: string) => void,
  onExit: (code: number | null) => void
): PtyHandle {
  const cwd = path.resolve(config.cwd ?? process.cwd());
  const env = buildEnv(config);

  if (ptyModule) {
    const isWin = os.platform() === "win32";
    const cols = Math.max(20, config.pty.cols || 120);
    const rows = Math.max(5, config.pty.rows || 30);

    const opts: Record<string, unknown> = {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env,
      encoding: "utf8",
    };

    if (isWin) {
      opts.useConpty = true;
      opts.useConptyDll = true;
      opts.conptyInheritCursor = false;
      activeBackend = "conpty";
    } else {
      activeBackend = "unix";
    }

    console.log(`[pty] spawn backend=${activeBackend} shell=${config.shell} ${cols}x${rows}`);
    console.log(`[pty] cwd=${cwd}`);

    let p: ReturnType<PtyMod["spawn"]>;
    try {
      p = ptyModule.spawn(config.shell, config.shellArgs || [], opts);
    } catch (e: any) {
      if (isWin) {
        console.warn(`[pty] conpty+dll failed: ${e?.message ?? e}; retry without dll`);
        try {
          delete opts.useConptyDll;
          p = ptyModule.spawn(config.shell, config.shellArgs || [], opts);
        } catch (e2: any) {
          console.warn(`[pty] conpty failed: ${e2?.message ?? e2}; retry winpty`);
          opts.useConpty = false;
          activeBackend = "winpty";
          p = ptyModule.spawn(config.shell, config.shellArgs || [], opts);
        }
      } else {
        throw e;
      }
    }

    p.onData((data: string) => onData(data));
    p.onExit(({ exitCode }) => onExit(typeof exitCode === "number" ? exitCode : 0));

    let dead = false;
    return {
      pid: p.pid,
      write: (data: string) => {
        if (dead) return;
        try {
          p.write(data);
        } catch (e: any) {
          console.warn(`[pty] write failed: ${e?.message ?? e}`);
        }
      },
      resize: (c: number, r: number) => {
        if (dead) return;
        if (!Number.isFinite(c) || !Number.isFinite(r)) return;
        c = Math.floor(c);
        r = Math.floor(r);
        if (c < 2 || r < 1) return;
        try {
          p.resize(c, r);
        } catch (e: any) {
          console.warn(`[pty] resize failed: ${e?.message ?? e}`);
        }
      },
      kill: () => {
        if (dead) return;
        dead = true;
        try {
          if (os.platform() === "win32") {
            p.kill();
          } else {
            try {
              p.kill("SIGHUP");
            } catch {
              p.kill();
            }
          }
        } catch {
          /* ignore */
        }
      },
      onData: (cb) => p.onData(cb),
      onExit: (cb) => p.onExit(({ exitCode }) => cb(exitCode)),
    };
  }

  activeBackend = "none";
  console.warn(
    "[pty] WARNING: node-pty unavailable. Tab / Ctrl+C / arrows will NOT work correctly."
  );
  const isWin = os.platform() === "win32";
  const child: ChildProcessWithoutNullStreams = spawn(config.shell, config.shellArgs || [], {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
  child.stdout.on("data", (chunk: Buffer) => onData(chunk.toString("utf-8")));
  child.stderr.on("data", (chunk: Buffer) => onData(chunk.toString("utf-8")));
  child.on("exit", (code) => onExit(code));
  child.on("error", (err) => {
    onData(`\r\n[pty error] ${err.message}\r\n`);
    onExit(1);
  });
  return {
    pid: child.pid,
    write: (data: string) => {
      if (child.stdin.writable) child.stdin.write(data);
    },
    resize: () => {},
    kill: () => {
      try {
        child.kill(isWin ? undefined : "SIGHUP");
      } catch {
        /* ignore */
      }
    },
    onData: () => {},
    onExit: (cb) => child.on("exit", cb),
  };
}
