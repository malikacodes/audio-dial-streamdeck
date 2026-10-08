import { test } from "node:test";
import assert from "node:assert/strict";
import { find, tapTarget, stepVolume, refreshPicks } from "../src/devices.js";
import { drawStrip } from "../src/strip.js";

// The same shape the helper reports. The USB id has the port number in
// it, like the real one on my Mac.
const headphones = { id: "USB:GeneralPlus:1123000:1", name: "USB Audio Device", isDefault: true, hasVolume: true, volume: 20, canMute: true, muted: false };
const monitor = { id: "1E6D6777", name: "LG ULTRAWIDE", isDefault: false, hasVolume: false, canMute: false, muted: false };
const speakers = { id: "BuiltInSpeakerDevice", name: "MacBook Pro Speakers", isDefault: false, hasVolume: true, volume: 25, canMute: true, muted: false };

const settings = { primary: headphones.id, primaryName: headphones.name, secondary: monitor.id, secondaryName: monitor.name };

// Makes one device the active one without touching the shared objects.
function withActive(active, devices = [headphones, monitor, speakers]) {
  return devices.map(d => ({ ...d, isDefault: d.id === active.id }));
}

// Protects the whole point of the dial: a tap goes back and forth.
test("a tap on Primary goes to Secondary, and back again", () => {
  assert.equal(tapTarget(withActive(headphones), settings).device.id, monitor.id);
  assert.equal(tapTarget(withActive(monitor), settings).device.id, headphones.id);
});

// If something else took over the sound (say, the laptop speakers after a
// reboot), one tap should bring me home to Primary, not do nothing.
test("a tap from a device that isn't one of my two goes to Primary", () => {
  assert.equal(tapTarget(withActive(speakers), settings).device.id, headphones.id);
});

// Protects against switching to a device that isn't there, which would
// leave the strip showing one thing and the sound going somewhere else.
test("a tap toward an unplugged device says so and switches nothing", () => {
  const result = tapTarget(withActive(headphones, [headphones, speakers]), settings);
  assert.equal(result.device, undefined);
  assert.equal(result.problem, "LG ULTRAWIDE not connected");
});

test("a tap before both devices are picked asks for them", () => {
  assert.equal(tapTarget(withActive(headphones), { primary: headphones.id }).problem, "Pick two devices");
});

// Moving the headphones to another USB port changes their id. Without the
// name as a backup the dial would call them "not connected" while they're
// playing music.
test("a device whose id changed is still found by its name", () => {
  const moved = { ...headphones, id: "USB:GeneralPlus:1124000:1" };
  assert.equal(find([moved, monitor], { id: headphones.id, name: headphones.name }), moved);
  assert.equal(tapTarget(withActive(monitor, [moved, monitor]), settings).device.id, moved.id);
});

// The id has to win over the name: two devices can share a name (plenty
// of things call themselves "USB Audio Device").
test("the id wins when two devices have the same name", () => {
  const twin = { ...headphones, id: "USB:Other:99:1" };
  assert.equal(find([twin, headphones], { id: headphones.id, name: headphones.name }), headphones);
});

test("a pick that matches nothing, or an empty pick, finds nothing", () => {
  assert.equal(find([monitor], { id: headphones.id, name: headphones.name }), null);
  assert.equal(find([monitor], { id: undefined, name: undefined }), null);
});

// A fast spin sends a big tick count. It must stop at the ends instead of
// asking macOS for 130% or -9%.
test("volume steps by the step size and stops at 0 and 100", () => {
  assert.equal(stepVolume(20, 2, 3), 26);
  assert.equal(stepVolume(20, -1, 5), 15);
  assert.equal(stepVolume(95, 4, 3), 100);
  assert.equal(stepVolume(4, -3, 3), 0);
});

// The settings page only saves the id. The name has to be filled in, or
// the name backup above has nothing to match on.
test("a freshly picked device gets its name saved", () => {
  const saved = refreshPicks([headphones, monitor], { primary: headphones.id, secondary: monitor.id });
  assert.equal(saved.primaryName, "USB Audio Device");
  assert.equal(saved.secondaryName, "LG ULTRAWIDE");
});

test("a device found by name gets its new id saved", () => {
  const moved = { ...headphones, id: "USB:GeneralPlus:1124000:1" };
  assert.equal(refreshPicks([moved, monitor], settings).primary, moved.id);
});

// This runs on every report from the helper. If it said "changed" when
// nothing did, the plugin would save settings several times a second.
test("settings that are already right aren't saved again", () => {
  assert.equal(refreshPicks([headphones, monitor], settings), null);
  assert.equal(refreshPicks([speakers], settings), null);
});

// The strip is the only way I can tell which device I'm on, so these
// check the words that end up on it.
test("the strip shows the device, its volume and which of my two it is", () => {
  const svg = drawStrip({ device: headphones, slot: "primary", notice: null });
  assert.match(svg, /USB Audio Device/);
  assert.match(svg, />20%</);
  // First dot pink, second one grey.
  assert.match(svg, /cx="172"[^>]*fill="#f2a7c3"/);
  assert.match(svg, /cx="185"[^>]*fill="#5c5c62"/);
});

test("the strip says Muted, and admits when a device has no volume", () => {
  assert.match(drawStrip({ device: { ...headphones, muted: true }, slot: "primary" }), />Muted</);
  const svg = drawStrip({ device: monitor, slot: "secondary" });
  assert.match(svg, /Volume on the device/);
  assert.doesNotMatch(svg, /%</);
});

// A device name with an & in it would make the whole picture invalid and
// the strip would go blank.
test("the strip survives awkward device names", () => {
  assert.match(drawStrip({ device: { ...headphones, name: "Me & My <Amp>" }, slot: null }), /Me &amp; My &lt;Amp&gt;/);
});

// The colors I pick in settings have to land on the right parts: the bar
// is the volume, the dot is the switch. Mixing them up would be silly.
test("the strip uses my colors for the volume bar and the active dot", () => {
  const svg = drawStrip({ device: headphones, slot: "secondary", volumeColor: "#00ffaa", switchColor: "#aa00ff" });
  assert.match(svg, /<rect[^>]*height="8"[^>]*fill="#00ffaa"/);
  assert.match(svg, /cx="185"[^>]*fill="#aa00ff"/);
  // The dot for the device I'm not on stays grey.
  assert.match(svg, /cx="172"[^>]*fill="#5c5c62"/);
});

// Settings are just text. A broken value must not end up inside the SVG,
// or the strip goes blank.
test("a color that isn't a hex color falls back to pink", () => {
  const svg = drawStrip({ device: headphones, slot: "primary", volumeColor: 'red" onload="x', switchColor: "" });
  assert.doesNotMatch(svg, /onload/);
  assert.match(svg, /<rect[^>]*height="8"[^>]*fill="#f2a7c3"/);
  assert.match(svg, /cx="172"[^>]*fill="#f2a7c3"/);
});
