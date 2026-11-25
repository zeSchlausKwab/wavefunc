"""Build the QuickJS CLI used by yt-dlp with the same NDK as the Android app."""

import hashlib
import io
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile


VERSION = "0.18.0"
URL = f"https://codeload.github.com/quickjs-ng/quickjs/tar.gz/refs/tags/v{VERSION}"
SHA256 = "28bcd89aa3683fd2a946537e5ce3f11cc46b5cbf3383c7561aaef3df5ff9f1dd"

TARGETS = {
    "arm64-v8a": "aarch64-linux-android",
    "armeabi-v7a": "armv7a-linux-androideabi",
    "x86_64": "x86_64-linux-android",
}
# Sources of the qjs_exe target in the upstream CMakeLists.txt.
SOURCES = [
    "dtoa.c", "libregexp.c", "libunicode.c", "quickjs.c", "quickjs-libc.c",
    "qjs.c", "gen/repl.c", "gen/standalone.c",
]


def build(ndk, output):
    compiler_name = "clang.exe" if sys.platform == "win32" else "clang"
    (compiler,) = ndk.glob(f"toolchains/llvm/prebuilt/*/bin/{compiler_name}")

    archive = subprocess.check_output([
        "curl", "--fail", "--silent", "--show-error", "--location",
        "--retry", "3", "--max-time", "120", URL,
    ])
    if hashlib.sha256(archive).hexdigest() != SHA256:
        raise ValueError(f"Checksum mismatch for QuickJS {VERSION}")

    with tempfile.TemporaryDirectory() as tmp:
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as sources:
            sources.extractall(tmp, filter="data")
        for abi, target in TARGETS.items():
            directory = output / abi
            directory.mkdir(parents=True, exist_ok=True)
            # Android extracts lib*.so to the executable nativeLibraryDir. This
            # file is a position-independent CLI executable despite its suffix.
            subprocess.run([
                compiler, f"--target={target}24", "-Os", "-D_GNU_SOURCE", "-DNDEBUG",
                "-I.", "-fPIE", "-pie", "-Wl,-z,max-page-size=16384", "-Wl,--strip-all",
                *SOURCES, "-ldl", "-lm", "-o", directory / "libwavefunc_qjs.so",
            ], cwd=Path(tmp) / f"quickjs-{VERSION}", check=True)


if __name__ == "__main__":
    build(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
