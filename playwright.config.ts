import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3199",
    channel: "msedge",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npx tsx scripts/test-server.ts",
    url: "http://127.0.0.1:3199/api/settings",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
