// Draws the touch strip above the dial as SVG text. It only draws, it
// never talks to Stream Deck or to macOS, so the tests can read what it
// made. The strip is 200 by 100 pixels.

const PINK = "#f2a7c3";
const DIM = "#5c5c62";
const FONT = "-apple-system, Helvetica, sans-serif";

// Device names come from macOS and could hold a < or an &, which would
// break the SVG.
function safe(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The strip fits about 20 letters at this size before they run off the edge.
function short(name) {
  return name.length > 20 ? name.slice(0, 19).trimEnd() + "…" : name;
}

// The colors come from the dial's settings and go straight into the SVG,
// so anything that isn't a plain hex color like #f2a7c3 falls back to pink
// instead of breaking the picture.
function color(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : PINK;
}

// view is { device, slot, notice, volumeColor, switchColor, dots }:
//   device       what the dial is controlling, or null. For the Output
//                Dial that's the active output device from the helper. For
//                the App Volume dial it's an app, shaped the same way.
//   slot         "primary", "secondary" or null when it's neither of my two
//   notice       a short message that takes over the strip for a moment
//   volumeColor  the volume bar
//   switchColor  the dot for the device I'm on
//   dots         false on the App Volume dial, which has nothing to switch
export function drawStrip({ device, slot, notice, volumeColor, switchColor, dots = true }) {
  const bar = color(volumeColor);
  const dot = color(switchColor);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100" font-family="${FONT}">`];

  if (notice) {
    parts.push(`<text x="100" y="56" fill="#ffffff" font-size="15" text-anchor="middle">${safe(short(notice))}</text>`);
  } else if (!device) {
    parts.push(`<text x="100" y="56" fill="${DIM}" font-size="15" text-anchor="middle">No output device</text>`);
  } else {
    parts.push(`<text x="14" y="30" fill="#ffffff" font-size="15" font-weight="600">${safe(short(device.name))}</text>`);

    // Two dots, like the pair under the Audio Switcher key: the filled one
    // is the device I'm on. Neither is filled on a device outside my two.
    if (dots) {
      parts.push(`<circle cx="172" cy="25" r="4" fill="${slot === "primary" ? dot : DIM}"/>`);
      parts.push(`<circle cx="185" cy="25" r="4" fill="${slot === "secondary" ? dot : DIM}"/>`);
    }

    if (!device.hasVolume) {
      // My monitor over HDMI: macOS has no volume for it at all.
      parts.push(`<text x="14" y="68" fill="${DIM}" font-size="14">Volume on the device</text>`);
    } else {
      const label = device.muted ? "Muted" : `${device.volume}%`;
      const width = Math.round((device.volume / 100) * 172);
      parts.push(`<text x="14" y="64" fill="${device.muted ? DIM : "#ffffff"}" font-size="22" font-weight="600">${label}</text>`);
      parts.push(`<rect x="14" y="78" width="172" height="8" rx="4" fill="#2c2c30"/>`);
      if (width > 0) parts.push(`<rect x="14" y="78" width="${Math.max(width, 8)}" height="8" rx="4" fill="${device.muted ? DIM : bar}"/>`);
    }
  }

  parts.push("</svg>");
  return parts.join("");
}
