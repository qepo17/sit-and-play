import { defineConfig } from "mygo-cli";
import { version } from "./package.json";

export default defineConfig({
  name: "Sit and Play",
  identifier: "io.github.qepo17.sitandplay",
  version,
  copyright: "Copyright (c) 2026 qepo17 and contributors",
  resources: ["LICENSE", "THIRD_PARTY_NOTICES.md", "licenses"],
  linux: {
    maintainer: "qepo17 <taufiqseptry17@gmail.com>",
    comment: "A controller-friendly interface for your Steam library",
    categories: ["Game"],
    command: "sit-and-play",
  },
  // `mygo dev` runs devCommand and loads devUrl; `mygo build` runs
  // buildCommand and embeds frontendDist into the app.
  devUrl: "http://localhost:5173",
  devCommand: "bun run dev:web",
  buildCommand: "bun run build:web",
  frontendDist: "dist",
  bindings: "src/mygo.ts",
  out: "build",
});
