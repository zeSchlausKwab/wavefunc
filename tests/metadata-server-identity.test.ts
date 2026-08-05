import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultMetadataServerPubkey } from "../src/config/serverIdentity";

function read(path: string) {
  return readFileSync(join(import.meta.dir, "..", path), "utf8");
}

describe("metadata server identity", () => {
  test("uses the deployed observer key when a production release has no injected override", () => {
    expect(defaultMetadataServerPubkey("production")).toBe(
      "bb0707242a17a4be881919b3dcfea63f42aacedc3ff898a66be30af195ff32b2",
    );
    expect(defaultMetadataServerPubkey("development")).toBe(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    );
  });

  test("keeps build-time, runtime, and ContextVM client defaults on the shared identity", () => {
    expect(read("build.ts")).toContain("defaultMetadataServerPubkey(appStage)");
    expect(read("src/config/env.ts")).toContain(
      "defaultMetadataServerPubkey(getAppStage())",
    );
    expect(read("src/ctxcn/WavefuncMetadataServerClient.ts")).toContain(
      "static readonly SERVER_PUBKEY = config.metadataServerPubkey",
    );
  });
});
