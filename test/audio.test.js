import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Audio } from "../src/audio.js";

// A stand-in for the Swift helper: a tiny script that prints what the test
// tells it to. The real one is a compiled binary, and I don't want a test
// touching the speakers.
function fakeHelper(body) {
  const dir = mkdtempSync(join(tmpdir(), "audio-dial-"));
  const path = join(dir, "helper.mjs");
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(path, 0o755);
  return { path, dir };
}

// Starts an Audio on a fake helper, with the clock under the test's
// control (so the 2 second restart wait doesn't make the test slow) and a
// logger that keeps what it's told. When the test ends, the helper is
// stopped and can't restart, or the test run would never finish.
function startAudio(t, helper) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const logs = [];
  const logger = {
    warn: message => logs.push(message),
    error: message => logs.push(message),
  };
  const audio = new Audio(helper.path, logger);
  audio.start();
  t.after(async () => {
    audio.start = () => {};
    const { helper: running } = audio;
    if (running.exitCode === null && running.signalCode === null) {
      running.kill();
      await once(running, "close");
    }
  });
  return { audio, logs };
}

const STAY_ALIVE = "setInterval(() => {}, 1000);";

// The dial draws from this list. If a report didn't land in `devices`, the
// strip would sit on whatever it knew before.
test("a report from the helper updates the devices and what the dial can do", async t => {
  const report = { devices: [{ id: "a", name: "Speakers", isDefault: false }, { id: "b", name: "Headphones", isDefault: true }], canPressKeys: true, fineTuneOpen: true };
  const { audio } = startAudio(t, fakeHelper(`console.log(${JSON.stringify(JSON.stringify(report))}); ${STAY_ALIVE}`));

  await once(audio, "change");

  assert.deepEqual(audio.devices, report.devices);
  assert.equal(audio.active.name, "Headphones");
  assert.equal(audio.canPressKeys, true);
  assert.equal(audio.fineTuneOpen, true);
});

// The settings page asks for the app list and waits. A helper that never
// answers must not leave it spinning, so the answer is an empty list.
test("openApps gives an empty list when the helper never answers", async t => {
  const { audio } = startAudio(t, fakeHelper(STAY_ALIVE));

  const asked = audio.openApps();
  t.mock.timers.tick(2000);

  assert.deepEqual(await asked, []);
  // The wait is over, so a late answer shouldn't have anyone listening.
  assert.equal(audio.listenerCount("apps"), 0);
});

// The first run prints junk and quits. The line is logged and skipped, and
// the exit brings the helper back once, after the wait. The second run
// stays up, so there is exactly one restart.
test("a line that isn't JSON is logged, and a helper that exits is started again once", { timeout: 10000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), "audio-dial-runs-"));
  const runs = join(dir, "runs");
  const helper = fakeHelper(`
    import { appendFileSync, existsSync } from "node:fs";
    const before = existsSync(${JSON.stringify(runs)});
    appendFileSync(${JSON.stringify(runs)}, "x\\n");
    if (before) { ${STAY_ALIVE} }
    else { console.log("not json at all"); }
  `);
  const { audio, logs } = startAudio(t, helper);
  const first = audio.helper;
  let changes = 0;
  audio.on("change", () => changes++);

  await once(first, "close");
  assert.ok(logs.some(line => line.includes("isn't JSON: not json at all")));
  // The bad line is skipped: nothing was stored, and the only change
  // announced is the helper stopping.
  assert.deepEqual(audio.devices, []);
  assert.equal(changes, 1);
  assert.ok(logs.some(line => line.includes("stopped")));
  // Nothing has started again yet: it waits out the restart time first.
  assert.equal(readFileSync(runs, "utf8"), "x\n");

  t.mock.timers.tick(2000);
  assert.notEqual(audio.helper, first);
  // Give the second run a moment to write its line, then check it stayed at two.
  while (readFileSync(runs, "utf8").split("\n").length < 3) await new Promise(resolve => setImmediate(resolve));
  // A second restart would have started during these turns of the loop
  // or this second tick, and would have written a third line.
  for (let i = 0; i < 200; i++) await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(2000);
  for (let i = 0; i < 200; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(readFileSync(runs, "utf8"), "x\nx\n");
});

// Valid JSON that isn't a report used to throw inside the line handler,
// which takes the plugin down. Each of these is skipped and logged, and
// the real report after them still gets through.
test("lines that are JSON but not a report are logged and skipped", { timeout: 10000 }, async t => {
  const report = { devices: [{ id: "a", name: "Speakers", isDefault: true }], canPressKeys: false, fineTuneOpen: false };
  const lines = ["null", "42", "[]", "{}", '{"devices":5}', '{"apps":"nope"}', JSON.stringify(report)];
  const { audio, logs } = startAudio(t, fakeHelper(`for (const line of ${JSON.stringify(lines)}) console.log(line); ${STAY_ALIVE}`));
  let changes = 0;
  audio.on("change", () => changes++);

  await once(audio, "change");

  assert.equal(changes, 1);
  assert.deepEqual(audio.devices, report.devices);
  assert.equal(logs.filter(line => line.includes("isn't a report")).length, 6);
});

// A helper that dies used to leave the last volume on the strip, and the
// dial kept sending turns to nobody. Now the state goes with it, the
// strip is told, and `down` says why the list is empty.
test("when the helper stops, what it reported is cleared and the strip is told", { timeout: 10000 }, async t => {
  const report = { devices: [{ id: "a", name: "Speakers", isDefault: true }], canPressKeys: true, fineTuneOpen: true };
  const { audio } = startAudio(t, fakeHelper(`console.log(${JSON.stringify(JSON.stringify(report))}); setTimeout(() => process.exit(1), 50);`));
  // Node's test clock is only for setTimeout in this process. The fake
  // helper is its own process, so its timer is real.
  await once(audio, "change");
  assert.equal(audio.down, false);
  const closed = once(audio.helper, "close");
  const told = once(audio, "change");

  await closed;
  await told;

  assert.deepEqual(audio.devices, []);
  assert.equal(audio.active, null);
  assert.equal(audio.canPressKeys, false);
  assert.equal(audio.fineTuneOpen, false);
  assert.equal(audio.down, true);
});

// A helper that can't start (I forgot "npm run helper") used to be tried
// every 2 seconds forever. Each failed try in a row now waits twice as
// long as the one before.
test("a helper that keeps dying is restarted after longer and longer waits", { timeout: 10000 }, async t => {
  const { audio } = startAudio(t, fakeHelper("process.exit(1);"));

  const first = audio.helper;
  await once(first, "close");
  t.mock.timers.tick(1999);
  assert.equal(audio.helper, first);
  t.mock.timers.tick(1);
  const second = audio.helper;
  assert.notEqual(second, first);

  await once(second, "close");
  t.mock.timers.tick(2000);
  assert.equal(audio.helper, second);
  t.mock.timers.tick(2000);
  const third = audio.helper;
  assert.notEqual(third, second);

  // It stops growing at 30 seconds, so it still comes back when I
  // finally build the helper.
  for (let wait = 8000; wait <= 30000; wait *= 2) {
    await once(audio.helper, "close");
    const before = audio.helper;
    t.mock.timers.tick(wait - 1);
    assert.equal(audio.helper, before);
    t.mock.timers.tick(1);
    assert.notEqual(audio.helper, before);
  }
  await once(audio.helper, "close");
  const last = audio.helper;
  t.mock.timers.tick(30000);
  assert.notEqual(audio.helper, last);
});

// Once the helper has reported, it was working. If it dies later, that's a
// new problem and gets the short wait again.
test("a report from the helper puts the restart wait back to 2 seconds", { timeout: 10000 }, async t => {
  const report = { devices: [], canPressKeys: false, fineTuneOpen: false };
  const { audio } = startAudio(t, fakeHelper(`console.log(${JSON.stringify(JSON.stringify(report))}); process.exit(1);`));

  for (let run = 0; run < 3; run++) {
    const before = audio.helper;
    await once(before, "close");
    t.mock.timers.tick(2000);
    assert.notEqual(audio.helper, before);
  }
});
