import { test } from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { appState, deviceState, afterKeys, volumeLink, muteLink, FineTune, TRUST_MS, REWATCH_MS } from "../src/finetune.js";
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

// What FineTune saves for my monitor, copied from the real file with the
// slider at 5 of its 16 steps.
const monitor = "1E6D6777-0000-0000-0A21-010380502178";
const withMonitor = {
  appSettings: { mediaKeyControlEnabled: true },
  softwareDeviceVolumes: { [monitor]: 0.09765625 },
  softwareDeviceMuteStates: { [monitor]: false },
};

// FineTune saves the slider squared. Read it straight and the strip says
// 10% while FineTune's own slider sits at 31%.
test("a monitor's saved loudness comes back as the slider's percent", () => {
  assert.deepEqual(deviceState(withMonitor, monitor), { volume: 31, muted: false });
  assert.equal(deviceState({ ...withMonitor, softwareDeviceVolumes: { [monitor]: 1 } }, monitor).volume, 100);
});

test("a muted monitor reads as muted", () => {
  const muted = { ...withMonitor, softwareDeviceVolumes: { [monitor]: 0 }, softwareDeviceMuteStates: { [monitor]: true } };
  assert.deepEqual(deviceState(muted, monitor), { volume: 0, muted: true });
});

// Null is what sends the strip back to "Volume on the device". A number
// here would promise a volume the dial has no way to change.
test("a device FineTune isn't turning has no borrowed volume", () => {
  assert.equal(deviceState(withMonitor, "BuiltInSpeakerDevice"), null);
  assert.equal(deviceState({}, monitor), null);
});

// The dial reaches FineTune by pressing the volume keys. With FineTune's
// media keys setting off, those presses do nothing to the monitor.
test("no borrowed volume when FineTune isn't listening for the volume keys", () => {
  assert.equal(deviceState({ ...withMonitor, appSettings: { mediaKeyControlEnabled: false } }, monitor), null);
});

// The strip shows this guess before FineTune has saved anything. These
// are the numbers FineTune really lands on, so a wrong one here is a
// number that visibly jumps half a second after every click.
test("the guess after a key press matches FineTune's real notches", () => {
  assert.equal(afterKeys(31, -1), 25);
  assert.equal(afterKeys(100, -3), 81);
  assert.equal(afterKeys(81, 3), 100);
});

test("the guess stops at silent and at full", () => {
  assert.equal(afterKeys(6, -4), 0);
  assert.equal(afterKeys(94, 5), 100);
});

// The class, without start(): no folder is watched and no link is opened.
// Time is the test's own (Date moves only when the test says), so the
// edge of the trust window can be checked to the millisecond.
function fineTuneAt(t, settings) {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const fineTune = new FineTune({ warn() {}, error() {} });
  fineTune.settings = settings;
  return fineTune;
}

// Just after my own change, FineTune's file still has the old number.
// Trusting the file would flick the strip back for a blink mid-turn.
test("an app I just changed shows my number, not the file's", t => {
  const fineTune = fineTuneAt(t, settings);
  fineTune.myChanges.set("com.apple.Music", { volume: 40, muted: true, at: Date.now() });

  t.mock.timers.tick(TRUST_MS - 1);

  assert.deepEqual(fineTune.state("com.apple.Music"), { volume: 40, muted: true });
});

// Exactly TRUST_MS later my number has run out, and the file wins again.
// If this were off by one, a number I set would stick forever or vanish early.
test("at exactly TRUST_MS the file wins again", t => {
  const fineTune = fineTuneAt(t, settings);
  fineTune.myChanges.set("com.apple.Music", { volume: 40, muted: true, at: Date.now() });

  t.mock.timers.tick(TRUST_MS);

  assert.deepEqual(fineTune.state("com.apple.Music"), { volume: 23, muted: false });
});

test("the monitor follows the same trust window as an app", t => {
  const fineTune = fineTuneAt(t, withMonitor);
  fineTune.myChanges.set(monitor, { volume: 50, muted: false, at: Date.now() });

  t.mock.timers.tick(TRUST_MS - 1);
  assert.deepEqual(fineTune.device(monitor), { volume: 50, muted: false });
  t.mock.timers.tick(1);
  assert.deepEqual(fineTune.device(monitor), { volume: 31, muted: false });
});

// A press with the settings at "normal" lands one notch away, and that is
// what the strip should show right away.
test("a key press is expected to land one notch away", t => {
  const fineTune = fineTuneAt(t, { ...withMonitor, appSettings: { mediaKeyControlEnabled: true, volumeHotkeyStep: "normal" } });

  fineTune.expectKeys(monitor, "down", 1);

  assert.deepEqual(fineTune.device(monitor), { volume: 25, muted: false });
});

// Without a settings file (FineTune never ran, so there's no folder) there
// is nothing to guess from. The app is at full volume, the monitor isn't
// FineTune's, and a key press leaves no expectation behind.
test("with no settings file, apps are at full volume and key presses guess nothing", t => {
  const fineTune = fineTuneAt(t, {});

  assert.deepEqual(fineTune.state("com.apple.Music"), { volume: 100, muted: false });
  assert.equal(fineTune.device(monitor), null);
  fineTune.expectKeys(monitor, "up", 1);
  assert.equal(fineTune.myChanges.size, 0);
});

// A folder of my own to point FineTune at, so these tests never read the
// real settings. The watcher it opens keeps the test run alive until it's
// closed, so it's closed when the test ends, pass or fail.
function fineTuneIn(t, folder) {
  const logs = [];
  const fineTune = new FineTune({ warn: message => logs.push(message), error: message => logs.push(message) }, folder);
  t.after(() => fineTune.watcher?.close());
  return { fineTune, logs };
}

// A settings file caught halfway through a save, or broken, used to be
// dropped without a word. The last good numbers stay, and the log says why.
test("a settings file that can't be read is logged and the last good one is kept", async t => {
  const folder = mkdtempSync(join(tmpdir(), "finetune-"));
  writeFileSync(join(folder, "settings.json"), JSON.stringify(settings));
  const { fineTune, logs } = fineTuneIn(t, folder);
  await fineTune.read();

  writeFileSync(join(folder, "settings.json"), '{"appVolumes": ');
  await fineTune.read();

  assert.deepEqual(fineTune.state("com.apple.Music"), { volume: 23, muted: false });
  assert.ok(logs.some(line => line.includes("Couldn't read FineTune's settings")));
});

// FineTune installed after the plugin started: the folder isn't there at
// first, and the watcher used to give up for good. Now it looks again.
test("a settings folder that appears later gets watched and read", { timeout: 10000 }, async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const folder = join(mkdtempSync(join(tmpdir(), "finetune-")), "FineTune");
  const { fineTune, logs } = fineTuneIn(t, folder);
  await fineTune.start();
  assert.ok(logs.some(line => line.includes("isn't there yet")));
  assert.equal(fineTune.watcher, undefined);

  mkdirSync(folder);
  writeFileSync(join(folder, "settings.json"), JSON.stringify(settings));
  const changed = once(fineTune, "change");
  t.mock.timers.tick(REWATCH_MS);
  await changed;

  assert.ok(fineTune.watcher);
  assert.deepEqual(fineTune.state("com.apple.Music"), { volume: 23, muted: false });
});

// Still no folder at the next look: nothing happens, and it tries again
// later instead of announcing a change nobody can see.
test("while the folder is still missing it keeps looking quietly", { timeout: 10000 }, async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const folder = join(mkdtempSync(join(tmpdir(), "finetune-")), "FineTune");
  const { fineTune, logs } = fineTuneIn(t, folder);
  await fineTune.start();
  let changes = 0;
  fineTune.on("change", () => changes++);
  const logged = logs.length;

  t.mock.timers.tick(REWATCH_MS);
  t.mock.timers.tick(REWATCH_MS);

  assert.equal(changes, 0);
  assert.equal(fineTune.watcher, undefined);
  assert.equal(logs.length, logged);

  // It really did look again: the folder shows up now and the next look finds it.
  mkdirSync(folder);
  t.mock.timers.tick(REWATCH_MS);
  await once(fineTune, "change");
  assert.ok(fineTune.watcher);
});

// A watcher with no error listener turns any hiccup (the folder deleted
// under it, say) into an uncaught error that closes the plugin. Now it's
// logged, the dead watcher is let go, and a new one is set up.
test("a watcher error is logged and the folder is watched again", { timeout: 10000 }, async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const folder = mkdtempSync(join(tmpdir(), "finetune-"));
  writeFileSync(join(folder, "settings.json"), JSON.stringify(settings));
  const { fineTune, logs } = fineTuneIn(t, folder);
  await fineTune.start();
  const dead = fineTune.watcher;
  const changed = once(fineTune, "change");
  let changes = 0;
  fineTune.on("change", () => changes++);

  dead.emit("error", new Error("folder went away"));
  // A second error from the same dead watcher must not set up a second one.
  dead.emit("error", new Error("again"));
  assert.ok(logs.some(line => line.includes("folder went away")));
  assert.equal(fineTune.watcher, null);
  t.mock.timers.tick(REWATCH_MS);
  await changed;

  assert.ok(fineTune.watcher);
  assert.notEqual(fineTune.watcher, dead);
  // Each look that finds the folder announces a change, and there was one look.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(changes, 1);
});

// The folder being deleted while the plugin runs (FineTune uninstalled and
// cleaned up). The watcher doesn't error, it just goes deaf.
test("deleting the settings folder makes the plugin look for it again", { timeout: 10000 }, async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const folder = mkdtempSync(join(tmpdir(), "finetune-"));
  writeFileSync(join(folder, "settings.json"), JSON.stringify(settings));
  const { fineTune } = fineTuneIn(t, folder);
  await fineTune.start();

  // The OS needs a moment before it reports on a brand new watcher. The
  // test clock has the timers, so this waits on the real one.
  const started = Date.now();
  while (Date.now() - started < 500) await new Promise(resolve => setImmediate(resolve));
  rmSync(folder, { recursive: true });
  while (fineTune.watcher) await new Promise(resolve => setImmediate(resolve));

  mkdirSync(folder);
  const changed = once(fineTune, "change");
  t.mock.timers.tick(REWATCH_MS);
  await changed;
  assert.ok(fineTune.watcher);
});
