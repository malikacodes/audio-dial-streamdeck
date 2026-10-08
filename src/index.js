import { fileURLToPath } from "node:url";
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { Audio } from "./audio.js";
import { find, picks, tapTarget, stepVolume, refreshPicks } from "./devices.js";
import { drawStrip } from "./strip.js";
import { FineTune } from "./finetune.js";

const NOTICE_MS = 2000;

// The helper is compiled into the plugin folder by "npm run helper".
const helperPath = fileURLToPath(new URL("../com.malikacodes.audio-dial.sdPlugin/bin/audio", import.meta.url));
const audio = new Audio(helperPath, streamDeck.logger);
const fineTune = new FineTune(streamDeck.logger);

// Stream Deck takes an image as a base64 "data URI", which is the whole
// picture packed into one long string.
function asImage(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

class OutputDial extends SingletonAction {
  // Per dial on screen: its settings, the message it's showing for a
  // moment (if any), and the last picture sent to it.
  settings = new Map();
  notices = new Map();
  lastImages = new Map();

  async onWillAppear(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.syncPicks(ev.action);
    await this.render(ev.action);
  }

  async onDidReceiveSettings(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.syncPicks(ev.action);
    await this.render(ev.action);
  }

  onWillDisappear(ev) {
    this.settings.delete(ev.action.id);
    this.notices.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
  }

  // Turning changes the volume of whatever is playing sound right now,
  // even if it isn't one of my two devices.
  async onDialRotate(ev) {
    const device = audio.active;
    if (!device?.hasVolume) return;
    const step = Number(this.settings.get(ev.action.id)?.step) || 3;

    // I change my own copy first and don't wait for the helper to report
    // back. A fast spin sends several turns in a row, and each one has to
    // start from where the last one left off.
    device.volume = stepVolume(device.volume, ev.payload.ticks, step);
    audio.setVolume(device, device.volume);

    // Turning a muted dial and hearing nothing would feel broken.
    if (device.muted) {
      device.muted = false;
      audio.setMuted(device, false);
    }
    await this.render(ev.action);
  }

  // Pressing the dial mutes and unmutes.
  onDialDown() {
    const device = audio.active;
    if (device?.canMute) audio.setMuted(device, !device.muted);
  }

  // Tapping the strip sends the sound to my other device. The strip
  // redraws on its own when the helper reports the switch.
  async onTouchTap(ev) {
    const { device, problem } = tapTarget(audio.devices, this.settings.get(ev.action.id) ?? {});
    if (problem) return this.showNotice(ev.action, problem);
    audio.makeDefault(device);
  }

  // The settings page asks for its device lists (sdpi-components calls
  // this a "datasource"). A saved device that's unplugged stays in the
  // list, or its dropdown would go blank and look like I never picked one.
  async onSendToPlugin(ev) {
    if (ev.payload?.event !== "getDevices") return;
    const items = audio.devices.map(d => ({ value: d.id, label: d.name }));
    for (const pick of Object.values(picks(this.settings.get(ev.action.id) ?? {}))) {
      if (pick.id && !find(audio.devices, pick)) items.push({ value: pick.id, label: `${pick.name || "Unknown"} (not connected)` });
    }
    await streamDeck.ui.sendToPropertyInspector({ event: "getDevices", items });
  }

  async showNotice(target, text) {
    this.notices.set(target.id, text);
    await this.render(target);
    setTimeout(() => {
      // Only clear it if a newer message hasn't replaced it.
      if (this.notices.get(target.id) !== text) return;
      this.notices.delete(target.id);
      this.render(target).catch(() => {});
    }, NOTICE_MS);
  }

  // Saves the device's name next to its id, and the new id when a device
  // came back on a different USB port (see refreshPicks).
  async syncPicks(target) {
    const next = refreshPicks(audio.devices, this.settings.get(target.id) ?? {});
    if (!next) return;
    this.settings.set(target.id, next);
    await target.setSettings(next);
  }

  async render(target) {
    const settings = this.settings.get(target.id) ?? {};
    const device = audio.active;
    const { primary, secondary } = picks(settings);
    let slot = null;
    if (device && find(audio.devices, primary) === device) slot = "primary";
    else if (device && find(audio.devices, secondary) === device) slot = "secondary";

    // The helper can report several times a second while a volume slider
    // is being dragged. Every setFeedback is a message to Stream Deck, so
    // a picture only goes out when it's different from the last one.
    const { volumeColor, switchColor } = settings;
    const image = asImage(drawStrip({ device, slot, notice: this.notices.get(target.id), volumeColor, switchColor }));
    if (this.lastImages.get(target.id) === image) return;
    this.lastImages.set(target.id, image);
    await target.setFeedback({ canvas: image });
  }
}

// One app's volume, through FineTune (see finetune.js). There's no tap
// here on purpose: inside a dial stack the tap or the press belongs to the
// stack, and this dial is the one I stack.
class AppDial extends SingletonAction {
  settings = new Map();
  lastImages = new Map();

  async onWillAppear(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.render(ev.action);
  }

  async onDidReceiveSettings(ev) {
    const settings = ev.payload.settings ?? {};
    this.settings.set(ev.action.id, settings);

    // The settings page only saves the app's id. I save its name next to
    // it, so the strip can still say "Music" when Music isn't open.
    const app = (await audio.openApps()).find(a => a.id === settings.app);
    if (app && app.name !== settings.appName) {
      const named = { ...settings, appName: app.name };
      this.settings.set(ev.action.id, named);
      await ev.action.setSettings(named);
    }
    await this.render(ev.action);
  }

  onWillDisappear(ev) {
    this.settings.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
  }

  async onDialRotate(ev) {
    const { app, step } = this.settings.get(ev.action.id) ?? {};
    if (!app) return;
    const { volume, muted } = fineTune.state(app);
    fineTune.setVolume(app, stepVolume(volume, ev.payload.ticks, Number(step) || 3));
    // Same as the Output Dial: turning a muted dial should make sound.
    if (muted) fineTune.setMuted(app, false);
    await this.render(ev.action);
  }

  async onDialDown(ev) {
    const { app } = this.settings.get(ev.action.id) ?? {};
    if (!app) return;
    fineTune.setMuted(app, !fineTune.state(app).muted);
    await this.render(ev.action);
  }

  // The app list for the settings page: what's open now, plus the app
  // this dial is already set to if it happens to be closed.
  async onSendToPlugin(ev) {
    if (ev.payload?.event !== "getApps") return;
    const { app, appName } = this.settings.get(ev.action.id) ?? {};
    const items = (await audio.openApps()).map(a => ({ value: a.id, label: a.name }));
    if (app && !items.some(item => item.value === app)) items.push({ value: app, label: `${appName || app} (not open)` });
    await streamDeck.ui.sendToPropertyInspector({ event: "getApps", items });
  }

  async render(target) {
    const { app, appName, volumeColor } = this.settings.get(target.id) ?? {};
    let view;
    if (fineTune.missing) view = { notice: "FineTune isn't installed" };
    else if (!app) view = { notice: "Pick an app" };
    else view = { device: { name: appName || app, hasVolume: true, ...fineTune.state(app) }, volumeColor, dots: false };

    const image = asImage(drawStrip(view));
    if (this.lastImages.get(target.id) === image) return;
    this.lastImages.set(target.id, image);
    await target.setFeedback({ canvas: image });
  }
}

const dial = new (action({ UUID: "com.malikacodes.audio-dial.output" })(OutputDial))();
const appDial = new (action({ UUID: "com.malikacodes.audio-dial.app" })(AppDial))();
streamDeck.actions.registerAction(dial);
streamDeck.actions.registerAction(appDial);

// FineTune's numbers changed, by this dial or by me in FineTune's menu.
fineTune.on("change", () => {
  for (const target of appDial.actions) {
    appDial.render(target).catch(error => streamDeck.logger.warn(`Couldn't redraw the app dial: ${error.message}`));
  }
});

// Redraw every copy of the dial whenever anything about sound changes,
// whoever changed it: the dial, the keyboard volume keys or the menu bar.
audio.on("change", () => {
  for (const target of dial.actions) {
    dial.syncPicks(target)
      .then(() => dial.render(target))
      .catch(error => streamDeck.logger.warn(`Couldn't redraw the dial: ${error.message}`));
  }
});

audio.start();
fineTune.start();
streamDeck.connect();
