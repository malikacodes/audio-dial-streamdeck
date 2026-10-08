import { test } from "node:test";
import assert from "node:assert/strict";
import { appState, volumeLink, muteLink } from "../src/finetune.js";
import { drawStrip } from "../src/strip.js";

// The same shape FineTune saves in its settings.json, with the parts the
// dial doesn't read left out.
const settings = {
  appVolumes: { "com.apple.Music": 0.2269317, "com.google.Chrome": 1.5 },
  appMutes: { "com.apple.Music": false, "com.hnc.Discord": true },
};

// FineTune saves volume as a fraction with a long tail. The strip needs a
// whole percent, or it would say 22.69317%.
test("an app's saved volume comes out as a whole percent", () => {
  assert.deepEqual(appState(settings, "com.apple.Music"), { volume: 23, muted: false });
});

// An app FineTune has never touched isn't in the file at all. If that read
// as 0 the dial would show silence for an app playing at full volume, and
// the first turn up would drop it to 3%.
test("an app FineTune hasn't touched is at full volume and not muted", () => {
  assert.deepEqual(appState(settings, "us.zoom.xos"), { volume: 100, muted: false });
  assert.deepEqual(appState({}, "us.zoom.xos"), { volume: 100, muted: false });
});

test("a muted app reads as muted even with no saved volume", () => {
  assert.deepEqual(appState(settings, "com.hnc.Discord"), { volume: 100, muted: true });
});

// FineTune can boost an app past 100%. The dial has to show that honestly,
// since the next turn down starts from there.
test("a boosted app reads above 100", () => {
  assert.equal(appState(settings, "com.google.Chrome").volume, 150);
});

// These are the exact links FineTune's guide documents. A wrong word in
// one and the dial turns happily while nothing changes.
test("the links match what FineTune expects", () => {
  assert.equal(volumeLink("com.apple.Music", 30), "finetune://set-volumes?app=com.apple.Music&volume=30");
  assert.equal(muteLink("com.apple.Music", true), "finetune://set-mute?app=com.apple.Music&muted=true");
  assert.equal(muteLink("com.apple.Music", false), "finetune://set-mute?app=com.apple.Music&muted=false");
});

// The two dots mean "which of my two devices". On an app's strip they'd
// mean nothing, so they have to stay off.
test("the app strip shows the app and its volume, without the device dots", () => {
  const svg = drawStrip({ device: { name: "Music", hasVolume: true, volume: 23, muted: false }, dots: false });
  assert.match(svg, />Music</);
  assert.match(svg, />23%</);
  assert.doesNotMatch(svg, /<circle/);
});
