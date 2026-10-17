// The App Volume dial doesn't change an app's volume itself. macOS has no
// setting for that, so an app called FineTune does the real work: it
// catches each app's sound and plays it back quieter. This file is how the
// plugin talks to it.
//
// Out: FineTune takes commands as links, like
//   finetune://set-volumes?app=com.apple.Music&volume=30
// In:  FineTune saves every app's volume and mute in a settings file, so
//   reading that file is how the dial knows the real number, even when I
//   moved the slider in FineTune's own menu.
//
// The Output Dial reads the same file for my monitor. macOS has no volume
// for it, so FineTune gives it one, and that number is saved in here too.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";

const FOLDER = join(homedir(), "Library/Application Support/FineTune");
const SETTINGS = "settings.json";

// How long my own change is trusted over the file. FineTune takes a moment
// to save, and without this the strip would jump back to the old number
// for a blink in the middle of a turn.
export const TRUST_MS = 1500;

// How often to look again for FineTune's folder while it isn't there.
export const REWATCH_MS = 10000;

// What FineTune's settings say about one app, as { volume, muted } with
// volume in percent. An app FineTune has never touched isn't in the file,
// and that means full volume, not zero.
export function appState(settings, appId) {
  const saved = settings?.appVolumes?.[appId];
  return {
    volume: typeof saved === "number" ? Math.round(saved * 100) : 100,
    muted: settings?.appMutes?.[appId] === true,
  };
}

// What FineTune's settings say about a device it turns down itself, as
// { volume, muted }, or null when it isn't doing that for this device.
//
// FineTune saves the loudness it applies, which is the slider squared
// (ears hear in curves, not straight lines). So a slider at 50% is saved
// as 0.25, and the square root gets the slider back.
//
// With FineTune's "media keys" setting off it ignores the volume keys, and
// the keys are the only way the dial can reach it. So that reads as null
// too, and the strip doesn't show a number the dial can't change.
export function deviceState(settings, deviceId) {
  const saved = settings?.softwareDeviceVolumes?.[deviceId];
  if (typeof saved !== "number" || settings?.appSettings?.mediaKeyControlEnabled !== true) return null;
  return {
    volume: Math.round(Math.sqrt(saved) * 100),
    muted: settings?.softwareDeviceMuteStates?.[deviceId] === true,
  };
}

// Where a device's volume lands after some presses of the volume keys
// (minus for down). FineTune's slider has 16 notches and a press moves
// one, so I count in notches and turn it back into a percent. Counting in
// percent would drift: a notch is 6.25, and the strip only shows 6 or 7.
export function afterKeys(volume, presses) {
  const notch = Math.round((volume * 16) / 100) + presses;
  return Math.round((Math.min(16, Math.max(0, notch)) * 100) / 16);
}

export function volumeLink(appId, volume) {
  return `finetune://set-volumes?${new URLSearchParams({ app: appId, volume: String(volume) })}`;
}

export function muteLink(appId, muted) {
  return `finetune://set-mute?${new URLSearchParams({ app: appId, muted: String(muted) })}`;
}

export class FineTune extends EventEmitter {
  settings = {};
  // My own recent changes, by app id: { volume, muted, at }.
  mine = new Map();
  // Set when a link couldn't be opened, which means FineTune isn't installed.
  missing = false;

  // The folder is only ever FineTune's own. The tests hand in one of
  // theirs so they never touch the real settings.
  constructor(logger, folder = FOLDER) {
    super();
    this.logger = logger;
    this.folder = folder;
  }

  async start() {
    await this.read();
    // No folder means FineTune has never run. The first turn of the dial
    // opens it, and the strip says so until then.
    if (!this.watchFolder()) this.logger.warn("FineTune's settings folder isn't there yet");
  }

  // I watch the folder and not the file. Apps often save by writing a
  // new file and swapping it in, and a watch on the old file would be
  // left staring at something that's gone. Says whether it could watch;
  // when it couldn't, it looks again later, so installing FineTune while
  // the plugin is running still works.
  watchFolder() {
    try {
      this.watcher = watch(this.folder, (_event, name) => {
        if (name && name !== SETTINGS) return;
        clearTimeout(this.settling);
        this.settling = setTimeout(() => this.read().then(() => this.emit("change")), 100);
      });
    } catch {
      setTimeout(() => this.watchLater(), REWATCH_MS);
      return false;
    }
    // Without a listener, an error on a watcher is thrown at the whole
    // plugin. A watcher that has failed is done, so I let go of it and
    // start over like the folder had never been there.
    const failed = this.watcher;
    failed.on("error", error => {
      this.logger.warn(`Lost the watch on FineTune's settings folder: ${error.message}`);
      failed.close();
      setTimeout(() => this.watchLater(), REWATCH_MS);
    });
    return true;
  }

  // The folder may have shown up with a settings file already in it, so
  // the first look after finding it also reads.
  async watchLater() {
    if (!this.watchFolder()) return;
    await this.read();
    this.emit("change");
  }

  async read() {
    try {
      this.settings = JSON.parse(await readFile(join(this.folder, SETTINGS), "utf8"));
    } catch (error) {
      // Caught halfway through a save, or not there. Keep the last good
      // copy, and say so, or a settings file that stays broken would look
      // like a dial that's just stuck.
      this.logger.warn(`Couldn't read FineTune's settings: ${error.message}`);
    }
  }

  state(appId) {
    const mine = this.mine.get(appId);
    if (mine && Date.now() - mine.at < TRUST_MS) return { volume: mine.volume, muted: mine.muted };
    return appState(this.settings, appId);
  }

  // Same trust as an app gets: for a moment after the dial pressed a key,
  // the number it expects wins over the file.
  device(deviceId) {
    const saved = deviceState(this.settings, deviceId);
    const mine = this.mine.get(deviceId);
    if (saved && mine && Date.now() - mine.at < TRUST_MS) return { volume: mine.volume, muted: mine.muted };
    return saved;
  }

  // The dial just pressed a volume key for this device ("up", "down" or
  // "mute", times over). FineTune takes about half a second to save the
  // new number, and a strip that waits for it feels like the dial is
  // dragging. So I work out where it will land and show that right away.
  //
  // Two cases get no guess and wait for the file. Coming out of mute,
  // because the file says 0 while muted and I can't see the volume it
  // will come back to. And any step setting in FineTune other than
  // "normal", because I only know the size of that one.
  expectKeys(deviceId, name, times) {
    const now = this.device(deviceId);
    if (!now || now.muted) return;
    if (name === "mute") this.mine.set(deviceId, { ...now, muted: true, at: Date.now() });
    else if (this.settings?.appSettings?.volumeHotkeyStep === "normal") {
      this.mine.set(deviceId, { ...now, volume: afterKeys(now.volume, name === "up" ? times : -times), at: Date.now() });
    }
  }

  setVolume(appId, volume) {
    this.mine.set(appId, { ...this.state(appId), volume, at: Date.now() });
    this.open(volumeLink(appId, volume));
  }

  setMuted(appId, muted) {
    this.mine.set(appId, { ...this.state(appId), muted, at: Date.now() });
    this.open(muteLink(appId, muted));
  }

  // -g opens the link in the background, so FineTune doesn't jump in front
  // of what I'm doing on every click of the dial. If FineTune is closed,
  // opening one of its links starts it.
  open(link) {
    execFile("open", ["-g", link], error => {
      const missing = Boolean(error);
      if (missing) this.logger.warn("Couldn't open a FineTune link. Is FineTune installed?");
      if (missing !== this.missing) {
        this.missing = missing;
        this.emit("change");
      }
    });
  }
}
