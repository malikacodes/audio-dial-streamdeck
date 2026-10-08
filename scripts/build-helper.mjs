// Compiles helper/audio.swift into the plugin folder as bin/audio.
// Needs Xcode's command line tools for swiftc. Run it again after any
// change to the Swift file, then restart the plugin.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// fileURLToPath and not .pathname, which would leave a space in the
// folder path as %20, and swiftc would never find the file.
const root = fileURLToPath(new URL("..", import.meta.url));

execFileSync(
  "swiftc",
  ["-O", `${root}helper/audio.swift`, "-o", `${root}com.malikacodes.audio-dial.sdPlugin/bin/audio`],
  { stdio: "inherit" },
);
