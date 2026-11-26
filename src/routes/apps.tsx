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
    description: "Unsigned .app bundle — unzip, move to Applications, right-click → Open on first launch.",
    files: [
      { label: "macOS ZIP", suffix: "-macos-arm64.zip", arch: "arm64" },
    ],
  },
  {
    id: "windows",
    name: "WINDOWS",
    icon: "desktop_windows",
    description: "Portable unsigned ZIP — unzip and run wavefunc_app.exe (More info → Run anyway on SmartScreen).",
    files: [
      { label: "Windows ZIP", suffix: "-windows-x64.zip", arch: "x64" },
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
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tighter font-headline">
            DOWNLOAD
          </h1>
          <div className="h-1.5 flex-grow bg-on-background" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-on-background/55">
          Terminal, desktop, Android, or browser — back up Crate songs locally in the Android or desktop app (desktop backups use yt-dlp, Deno &amp; FFmpeg).
        </p>
      </div>

      {/* Terminal TUI banner (compact side-by-side layout on desktop) */}
      <div className="border-4 border-on-background bg-on-background text-surface shadow-[6px_6px_0px_0px_rgba(182,0,19,1)] p-3.5 sm:p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px] gap-4 lg:gap-5 items-center">
          {/* Left: info + platform one-liner installer */}
          <div className="space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="material-symbols-outlined text-2xl text-secondary-fixed-dim">terminal</span>
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-black uppercase tracking-tight font-headline">
                    TERMINAL_TUI (wf)
                  </span>
                  <span className="bg-primary text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-widest">
                    ONE-LINER
                  </span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-surface/70">
                  POCKET_SONIC_MACHINE — MACOS · LINUX · WINDOWS — NOSTR SYNC
                </div>
              </div>
              <a
                href={GITHUB_RELEASES}
                target="_blank"
                rel="noopener noreferrer"
                className="border-2 border-surface/40 px-3 py-1.5 font-black uppercase tracking-tight text-xs hover:bg-surface hover:text-on-background transition-colors"
              >
                BINARIES
              </a>
            </div>

            {/* Platform one-liner tabs */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
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
                      className={`px-2.5 py-1 font-black uppercase tracking-widest text-[10px] border-2 transition-colors cursor-pointer ${
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

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-black/40 border-2 border-secondary-fixed-dim/60 p-2.5">
                <code className="flex-1 font-mono text-xs sm:text-sm text-secondary-fixed-dim break-all select-all">
                  {activeTerminal.command}
                </code>
                <button
                  type="button"
                  onClick={handleCopyInstall}
                  className="shrink-0 bg-secondary-fixed-dim text-on-background px-3.5 py-1.5 font-black uppercase tracking-tight text-xs hover:bg-primary hover:text-white transition-colors cursor-pointer"
                >
                  {copiedCmd ? "COPIED" : "COPY"}
                </button>
              </div>

              <p className="text-[10px] font-bold uppercase tracking-widest text-surface/65 leading-relaxed">
                {activeTerminal.note}
              </p>
            </div>

            <p className="text-[10px] font-bold uppercase tracking-widest text-surface/55">
              RUN <code className="text-secondary-fixed-dim">wf</code> FOR THE FULL TUI, <code className="text-secondary-fixed-dim">wf --lucky</code> FOR INSTANT RADIO, OR <code className="text-secondary-fixed-dim">wf play jazz</code>
            </p>
          </div>

          {/* Right: compact framed TUI teaser video */}
          <div className="w-full max-w-[440px] lg:max-w-none mx-auto border-2 border-secondary-fixed-dim/50 bg-[#0b0a08] overflow-hidden">
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
        </div>
      </div>

      {/* Platform cards — all 4 visible in one row on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sorted.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            isDetected={platform.id === detectedPlatform}
          />
        ))}
      </div>

      {/* Secondary links strip: Web App · Zapstore · Source Code */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border-4 border-on-background bg-secondary-fixed-dim shadow-[5px_5px_0px_0px_rgba(29,28,19,1)] p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-2xl shrink-0">language</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-black uppercase tracking-tight font-headline">WEB_APP</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/70 truncate">
              NO_DOWNLOAD — USE_IN_BROWSER
            </div>
          </div>
          <a
            href="/"
            className="shrink-0 bg-on-background text-surface px-3.5 py-2 font-black uppercase tracking-tight text-xs shadow-[3px_3px_0px_0px_rgba(182,0,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
          >
            OPEN_APP
          </a>
        </div>

        <div className="border-4 border-on-background bg-surface-container-high shadow-[5px_5px_0px_0px_rgba(29,28,19,1)] p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-2xl shrink-0">storefront</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-black uppercase tracking-tight font-headline">ZAPSTORE</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 truncate">
              NOSTR_VERIFIED_ANDROID
            </div>
          </div>
          <a
            href="https://zapstore.dev/apps/live.wavefunc.app"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 border-2 border-on-background px-3.5 py-1.5 font-black uppercase tracking-tight text-xs hover:bg-on-background hover:text-surface transition-colors"
          >
            VIEW
          </a>
        </div>

        <div className="border-4 border-on-background bg-surface-container-high shadow-[5px_5px_0px_0px_rgba(29,28,19,1)] p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-2xl shrink-0">code</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-black uppercase tracking-tight font-headline">SOURCE_CODE</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 truncate">
              MIT_LICENSE — BUILD_LOCALLY
            </div>
          </div>
          <a
            href={`https://github.com/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 border-2 border-on-background px-3.5 py-1.5 font-black uppercase tracking-tight text-xs hover:bg-on-background hover:text-surface transition-colors"
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
      className={`border-4 border-on-background bg-surface-container-high shadow-[5px_5px_0px_0px_rgba(29,28,19,1)] p-4 flex flex-col justify-between gap-3 ${
        isDetected ? "ring-4 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-xl">{platform.icon}</span>
          <div className="text-lg font-black uppercase tracking-tight font-headline">
            {platform.name}
          </div>
          {isDetected && (
            <span className="ml-auto bg-primary text-white text-[10px] font-black px-1.5 py-0.5 uppercase tracking-widest">
              DETECTED
            </span>
          )}
        </div>

        <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/55 leading-relaxed">
          {platform.description}
        </p>
      </div>

      <div className="space-y-2">
        {platform.files.map((file) => (
          <a
            key={file.suffix}
            href={GITHUB_RELEASES}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full bg-primary text-white px-3.5 py-2.5 font-black uppercase tracking-tight text-xs shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span className="truncate">{file.label}</span>
            {file.arch && (
              <span className="ml-auto shrink-0 text-[10px] font-bold tracking-widest opacity-75">
                {file.arch}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
