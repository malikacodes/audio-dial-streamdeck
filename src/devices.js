// The thinking part of the dial, with no Stream Deck or macOS in it, so it
// can be tested with plain lists of devices.
//
// A device here is what the helper reports:
//   { id, name, isDefault, hasVolume, volume, canMute, muted }
// A saved pick is { id, name } from the dial's settings.

// Finds a saved pick among the devices plugged in right now. The id wins,
// but a USB device's id includes the port it's plugged into, so moving my
// headphones to another port changes it. The name is the backup for that.
export function find(devices, pick) {
  if (!pick?.id && !pick?.name) return null;
  return devices.find(d => d.id === pick.id) ?? devices.find(d => d.name === pick.name) ?? null;
}

export function picks(settings) {
  return {
    primary: { id: settings.primary, name: settings.primaryName },
    secondary: { id: settings.secondary, name: settings.secondaryName },
  };
}

// Where a tap should send the sound. On Primary it goes to Secondary. On
// anything else (Secondary, or a device that isn't one of my two) it goes
// to Primary. Returns { device } to switch to, or { problem } to show on
// the strip when there's nowhere to go.
export function tapTarget(devices, settings) {
  const { primary, secondary } = picks(settings);
  if (!primary.id || !secondary.id) return { problem: "Pick two devices" };

  const active = devices.find(d => d.isDefault);
  const onPrimary = active && find(devices, primary) === active;
  const wanted = onPrimary ? secondary : primary;
  const device = find(devices, wanted);
  if (!device) return { problem: `${wanted.name || "Device"} not connected` };
  return { device };
}

// One click of the dial is one tick. Turning fast sends several at once.
export function stepVolume(volume, ticks, step) {
  return Math.min(100, Math.max(0, volume + ticks * step));
}

// Keeps the saved picks in step with the real devices: fills in the name
// the first time a device is picked, and swaps in the new id when a device
// was found by name. Returns the settings to save, or null if nothing
// changed.
export function refreshPicks(devices, settings) {
  const next = { ...settings };
  for (const slot of ["primary", "secondary"]) {
    const device = find(devices, { id: settings[slot], name: settings[`${slot}Name`] });
    if (!device) continue;
    next[slot] = device.id;
    next[`${slot}Name`] = device.name;
  }
  const changed = Object.keys(next).some(key => next[key] !== settings[key]);
  return changed ? next : null;
}
