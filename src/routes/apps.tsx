import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/apps")({
  component: Apps,
});

const GITHUB_REPO = "zeSchlausKwab/wavefunc";
const GITHUB_RELEASES = `https://github.com/${GITHUB_REPO}/releases/latest`;

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
    description: "Unsigned .dmg — right-click the app and select 'Open' to bypass Gatekeeper on first launch.",
    files: [
      { label: "DMG (Universal)", suffix: ".dmg" },
    ],
  },
  {
    id: "windows",
    name: "WINDOWS",
    icon: "desktop_windows",
    description: "Unsigned installer — click 'More info' then 'Run anyway' if SmartScreen appears.",
    files: [
      { label: "MSI Installer", suffix: ".msi", arch: "x64" },
      { label: "EXE Installer", suffix: ".exe", arch: "x64" },
    ],
  },
  {
    id: "linux",
    name: "LINUX",
    icon: "terminal",
    description: "AppImage is portable and runs on most distros. Deb package for Debian/Ubuntu.",
    files: [
      { label: "AppImage", suffix: ".AppImage", arch: "x86_64" },
      { label: "Deb Package", suffix: ".deb", arch: "amd64" },
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

function Apps() {
  const detectedPlatform = detectPlatform();

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
          ALL_BUILDS_ARE_UNSIGNED — DIRECT_DOWNLOAD_FROM_GITHUB_RELEASES
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
