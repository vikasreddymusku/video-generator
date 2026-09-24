import { build } from "esbuild";
await build({
  entryPoints: ["src/server/main.ts"],
  outfile: "dist/server.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  sourcemap: true,
});
