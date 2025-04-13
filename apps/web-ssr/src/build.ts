import fs from "node:fs/promises";
import path from "node:path";

async function build() {
  const publicDir = path.join(process.cwd(), "public");
  const buildDir = path.join(publicDir, "build");
  
  // Ensure directories exist
  await fs.mkdir(buildDir, { recursive: true });
  
  // Build client bundle
  const clientBuild = await Bun.build({
    entrypoints: ["./src/client.tsx"],
    outdir: buildDir,
    naming: "[name].js",
    minify: true,
    target: "browser",
  });
  
  if (!clientBuild.success) {
    console.error("Client build failed:", clientBuild.logs);
    process.exit(1);
  }
  
  // Copy CSS file
  const cssSource = path.join(process.cwd(), "src", "styles.css");
  const cssTarget = path.join(buildDir, "styles.css");
  
  try {
    await fs.copyFile(cssSource, cssTarget);
  } catch (err) {
    console.warn("Warning: Could not copy CSS file. Make sure src/styles.css exists.");
  }
  
  console.log("Build completed successfully!");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
}); 