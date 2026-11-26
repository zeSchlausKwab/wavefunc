import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/apps")({
  component: Apps,
});

const GITHUB_REPO = "zeSchlausKwab/wavefunc";
const GITHUB_RELEASES = `https://github.com/${GITHUB_REPO}/releases/latest`;

type TerminalInstallMethodId = "posix" | "homebrew" | "windows";

interface TerminalInstallMethod {
  id: TerminalInstallMethodId;
  label: string;
  command: string;
  note: string;
}

const TERMINAL_INSTALL_METHODS: TerminalInstallMethod[] = [
  {
    id: "posix",
    label: "MACOS / LINUX",
    command: "curl -fsSL https://wavefunc.live/install.sh | sh",
    note: "SINGLE STATIC BINARY (MACOS ARM64/X64 · LINUX X64/ARM64) — USES MPV, FFPLAY, OR VLC FOR AUDIO",
  },
  {
    id: "homebrew",
    label: "HOMEBREW",
    command: "brew install zeSchlausKwab/tap/wf",
    note: "MACOS & LINUXBREW — AUTOMATICALLY INSTALLS MPV SO AUDIO WORKS OUT OF THE BOX",
  },
  {
    id: "windows",
    label: "WINDOWS",
    command: "irm https://wavefunc.live/install.ps1 | iex",
    note: "POWERSHELL ONE-LINER (WINDOWS X64) — VERIFIES SHA-256 & ADDS wf.exe TO USER PATH (WINGET INSTALL MPV FOR AUDIO)",
  },
];

interface Platform {
  id: string;
  name: string;
  icon: string;
  description: string;
  files: { label: string; suffix: string; arch?: string }[];
}

const PLATFORMS: Platform[] = [
  {
    id: "android",
    name: "ANDROID",
    icon: "phone_android",
    description: "APK direct download. Enable 'Install from unknown sources' in your device settings.",
    files: [
      { label: "APK (Universal)", suffix: ".apk" },
    ],
  },
  {
    id: "macos",
    name: "macOS",
    icon: "laptop_mac",
    description: "Unsigned .app bundle — unzip, move to Applications, then right-click and select 'Open' on first launch.",
    files: [
      { label: "macOS Archive (Apple Silicon)", suffix: "-macos-arm64.zip", arch: "arm64" },
    ],
  },
  {
    id: "windows",
    name: "WINDOWS",
    icon: "desktop_windows",
    description: "Portable unsigned bundle — unzip and run wavefunc_app.exe. Click 'More info' then 'Run anyway' if SmartScreen appears.",
    files: [
      { label: "Windows Portable ZIP", suffix: "-windows-x64.zip", arch: "x64" },
    ],
  },
  {
    id: "linux",
    name: "LINUX",
    icon: "terminal",
    description: "Portable Linux x64 bundle — extract the tarball and run ./wavefunc_app.",
    files: [
      { label: "Linux Tarball", suffix: "-linux-x64.tar.gz", arch: "x86_64" },
    ],
  },
];

function detectPlatform(): string | null {
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/mac/.test(ua)) return "macos";
  if (/win/.test(ua)) return "windows";
  if (/linux/.test(ua)) return "linux";
  return null;
}

function defaultTerminalMethod(platform: string | null): TerminalInstallMethodId {
  if (platform === "windows") return "windows";
  if (platform === "macos") return "homebrew";
  return "posix";
}

function Apps() {
  const detectedPlatform = detectPlatform();
  const [terminalMethod, setTerminalMethod] = useState<TerminalInstallMethodId>(() =>
    defaultTerminalMethod(detectedPlatform),
  );
  const [copiedCmd, setCopiedCmd] = useState(false);

  const activeTerminal =
    TERMINAL_INSTALL_METHODS.find((m) => m.id === terminalMethod) ??
    TERMINAL_INSTALL_METHODS[0]!;

  const handleCopyInstall = () => {
    navigator.clipboard?.writeText(activeTerminal.command).then(() => {
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 2000);
    }).catch(() => {});
  };

  const sorted = [...PLATFORMS].sort((a, b) => {
    if (a.id === detectedPlatform) return -1;
    if (b.id === detectedPlatform) return 1;
    return 0;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl sm:text-4xl md:text-6xl font-black uppercase tracking-tighter font-headline">
            DOWNLOAD
          </h1>
          <div className="h-2 flex-grow bg-on-background" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-on-background/50">
          Back up songs as audio or video from your Crate in the Android or desktop app.
        </p>
      </div>

      {/* Web app banner */}
      <div className="border-4 border-on-background bg-secondary-fixed-dim shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] p-6">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-3xl">language</span>
          <div className="flex-1">
            <div className="text-lg font-black uppercase tracking-tight font-headline">WEB_APP</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/70">
              NO_DOWNLOAD_REQUIRED — USE_IN_BROWSER
            </div>
          </div>
          <a
            href="/"
            className="bg-on-background text-surface px-5 py-2.5 font-black uppercase tracking-tight text-sm shadow-[4px_4px_0px_0px_rgba(182,0,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
          >
            OPEN_APP
          </a>
        </div>
      </div>

      {/* Terminal TUI banner */}
      <div className="border-4 border-on-background bg-on-background text-surface shadow-[6px_6px_0px_0px_rgba(182,0,19,1)] p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="material-symbols-outlined text-3xl text-secondary-fixed-dim">terminal</span>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              <span className="text-lg font-black uppercase tracking-tight font-headline">
                TERMINAL_TUI (wf)
              </span>
              <span className="bg-primary text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-widest">
                ONE-LINER
              </span>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-surface/70">
              POCKET_SONIC_MACHINE — MACOS · LINUX · WINDOWS — CROSS-DEVICE NOSTR SYNC
            </div>
          </div>
          <a
            href={GITHUB_RELEASES}
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-surface/40 px-4 py-2 font-black uppercase tracking-tight text-xs hover:bg-surface hover:text-on-background transition-colors"
          >
            BINARIES
          </a>
        </div>

        {/* Live recorded TUI teaser video */}
        <div className="border-2 border-secondary-fixed-dim/50 bg-[#0b0a08] overflow-hidden">
          <video
            className="w-full aspect-video block"
            autoPlay
            loop
            muted
            playsInline
            controls
            poster="/media/wf-teaser-poster.png"
          >
            <source src="/media/wf-teaser.webm" type="video/webm" />
            <source src="/media/wf-teaser.mp4" type="video/mp4" />
          </video>
        </div>

        {/* Platform one-liner tabs */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {TERMINAL_INSTALL_METHODS.map((method) => {
              const active = method.id === activeTerminal.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => {
                    setTerminalMethod(method.id);
                    setCopiedCmd(false);
                  }}
                  className={`px-3 py-1.5 font-black uppercase tracking-widest text-[10px] border-2 transition-colors cursor-pointer ${
                    active
                      ? "bg-secondary-fixed-dim text-on-background border-secondary-fixed-dim"
                      : "bg-transparent text-surface/70 border-surface/30 hover:border-surface hover:text-surface"
                  }`}
                >
                  {method.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-black/40 border-2 border-secondary-fixed-dim/60 p-3">
            <code className="flex-1 font-mono text-xs sm:text-sm text-secondary-fixed-dim break-all select-all">
              {activeTerminal.command}
            </code>
            <button
              type="button"
              onClick={handleCopyInstall}
              className="shrink-0 bg-secondary-fixed-dim text-on-background px-4 py-2 font-black uppercase tracking-tight text-xs hover:bg-primary hover:text-white transition-colors cursor-pointer"
            >
              {copiedCmd ? "COPIED" : "COPY"}
            </button>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest text-surface/65 leading-relaxed">
            {activeTerminal.note}
          </p>
        </div>

        <p className="text-[10px] font-bold uppercase tracking-widest text-surface/55">
          RUN <code className="text-secondary-fixed-dim">wf</code> FOR THE FULL TUI, <code className="text-secondary-fixed-dim">wf --lucky</code> FOR INSTANT RADIO, OR <code className="text-secondary-fixed-dim">wf play jazz</code> TO JUMP RIGHT IN
        </p>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sorted.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            isDetected={platform.id === detectedPlatform}
          />
        ))}
      </div>

      {/* Zapstore */}
      <div className="border-4 border-on-background bg-surface-container-high shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] p-6">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-3xl">storefront</span>
          <div className="flex-1">
            <div className="text-lg font-black uppercase tracking-tight font-headline">ZAPSTORE</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
              DECENTRALIZED_APP_STORE — NOSTR_VERIFIED
            </div>
          </div>
          <a
            href="https://zapstore.dev/apps/live.wavefunc.app"
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-on-background px-5 py-2.5 font-black uppercase tracking-tight text-sm hover:bg-on-background hover:text-surface transition-colors"
          >
            VIEW
          </a>
        </div>
      </div>

      {/* Source code */}
      <div className="border-4 border-on-background bg-surface-container-high shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] p-6">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-3xl">code</span>
          <div className="flex-1">
            <div className="text-lg font-black uppercase tracking-tight font-headline">SOURCE_CODE</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
              MIT_LICENSE — BUILD_FROM_SOURCE
            </div>
          </div>
          <a
            href={`https://github.com/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-on-background px-5 py-2.5 font-black uppercase tracking-tight text-sm hover:bg-on-background hover:text-surface transition-colors"
          >
            GITHUB
          </a>
        </div>
      </div>
    </div>
  );
}

function PlatformCard({ platform, isDetected }: { platform: Platform; isDetected: boolean }) {
  return (
    <div
      className={`border-4 border-on-background bg-surface-container-high shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] p-6 space-y-4 ${
        isDetected ? "ring-4 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-2xl">{platform.icon}</span>
        <div className="text-xl font-black uppercase tracking-tight font-headline">
          {platform.name}
        </div>
        {isDetected && (
          <span className="ml-auto bg-primary text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-widest">
            DETECTED
          </span>
        )}
      </div>

      <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 leading-relaxed">
        {platform.description}
      </p>
      {platform.id !== "android" && (
        <p className="text-xs text-on-background/70">
          For song backups, install yt-dlp, Deno and FFmpeg on this computer.
        </p>
      )}

      <div className="space-y-2">
        {platform.files.map((file) => (
          <a
            key={file.suffix}
            href={GITHUB_RELEASES}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full bg-primary text-white px-4 py-3 font-black uppercase tracking-tight text-sm shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            {file.label}
            {file.arch && (
              <span className="ml-auto text-[10px] font-bold tracking-widest opacity-70">
                {file.arch}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
