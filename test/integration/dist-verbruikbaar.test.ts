// Via een kaal Node-kindproces, niet via Vitest: Vite's resolver is losser dan Node's ESM-lader
// (zie @goodapp/ai en @goodapp/observability: ontbrekende .js-extensies vielen alleen in Node op).
import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

beforeAll(() => {
  execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "pipe" });
}, 60_000);

describe("dist is bruikbaar in gewoon Node", () => {
  it("cjs: require levert de exports", () => {
    const uit = execFileSync("node", ["-e", "const m=require('./dist/cjs/server/index.js');console.log(Object.keys(m).sort().join(','))"], { cwd: ROOT }).toString().trim();
    expect(uit).toBe("STANDAARD_TOLERANTIE_SECONDEN,expressWebhookHandler,verifieerHandtekening,verwerkWebhook");
    const t = execFileSync("node", ["-e", "console.log(Object.keys(require('./dist/cjs/server/testing.js')).join(','))"], { cwd: ROOT }).toString().trim();
    expect(t).toBe("maakTestHandtekening");
  });

  it("esm: import levert dezelfde exports", () => {
    const uit = execFileSync("node", ["--input-type=module", "-e", "import * as m from './dist/esm/server/index.js';console.log(Object.keys(m).sort().join(','))"], { cwd: ROOT }).toString().trim();
    expect(uit).toBe("STANDAARD_TOLERANTIE_SECONDEN,expressWebhookHandler,verifieerHandtekening,verwerkWebhook");
  });
});
