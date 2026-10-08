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
const TRUST_MS = 1500;

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

  constructor(logger) {
    super();
    this.logger = logger;
  }

  async start() {
    await this.read();
    // I watch the folder and not the file. Apps often save by writing a
    // new file and swapping it in, and a watch on the old file would be
    // left staring at something that's gone.
    try {
      watch(FOLDER, (_event, name) => {
        if (name && name !== SETTINGS) return;
        clearTimeout(this.settling);
        this.settling = setTimeout(() => this.read().then(() => this.emit("change")), 100);
      });
    } catch {
      // No folder means FineTune has never run. The first turn of the dial
      // opens it, and the strip says so until then.
      this.logger.warn("FineTune's settings folder isn't there yet");
    }
  }

  async read() {
    try {
      this.settings = JSON.parse(await readFile(join(FOLDER, SETTINGS), "utf8"));
    } catch {
      // Caught halfway through a save, or not there. Keep the last good copy.
    }
  }

  state(appId) {
    const mine = this.mine.get(appId);
    if (mine && Date.now() - mine.at < TRUST_MS) return { volume: mine.volume, muted: mine.muted };
    return appState(this.settings, appId);
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
