// Starts the Swift helper (bin/audio in the plugin folder) and keeps the
// latest list of output devices it reported. Everything the dial knows
// about sound on this Mac comes through here.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";

const RESTART_MS = 2000;

export class Audio extends EventEmitter {
  devices = [];
  // For turning a device through FineTune (see pressKey).
  canPressKeys = false;
  fineTuneOpen = false;

  constructor(helperPath, logger) {
    super();
    this.helperPath = helperPath;
    this.logger = logger;
  }

  start() {
    const helper = spawn(this.helperPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.helper = helper;

    // The helper prints one JSON line per report, so I read line by line.
    createInterface({ input: helper.stdout }).on("line", line => {
      let report;
      try {
        report = JSON.parse(line);
      } catch {
        this.logger.warn(`Helper sent something that isn't JSON: ${line}`);
        return;
      }
      // Two kinds of line come back: the list of open apps, which is only
      // ever an answer to openApps(), and the device report. Valid JSON
      // can still be the wrong thing (null, {}), and one of those would
      // throw in here and take the plugin down, so anything that isn't
      // one of the two is logged and skipped.
      if (Array.isArray(report?.apps)) {
        this.emit("apps", report.apps);
        return;
      }
      if (!Array.isArray(report?.devices)) {
        this.logger.warn(`Helper sent something that isn't a report: ${line}`);
        return;
      }
      this.devices = report.devices;
      this.canPressKeys = report.canPressKeys === true;
      this.fineTuneOpen = report.fineTuneOpen === true;
      this.emit("change");
    });
    createInterface({ input: helper.stderr }).on("line", line => this.logger.warn(`Helper: ${line}`));

    // Without this, writing to a helper that just died throws and takes
    // the whole plugin down with it.
    helper.stdin.on("error", () => {});
    // A missing bin/audio (I forgot "npm run helper") lands here.
    helper.on("error", error => this.logger.error(`Couldn't start the audio helper: ${error.message}`));
    // "close" comes after both a crash and a failed start, so this one
    // place covers bringing it back.
    helper.on("close", code => {
      this.logger.warn(`Audio helper stopped (${code}). Starting it again.`);
      setTimeout(() => this.start(), RESTART_MS);
    });
  }

  get active() {
    return this.devices.find(d => d.isDefault) ?? null;
  }

  send(command) {
    if (this.helper?.stdin.writable) this.helper.stdin.write(JSON.stringify(command) + "\n");
  }

  // The apps that are open right now, as [{ id, name }]. If the helper
  // never answers, the settings page gets an empty list instead of
  // spinning forever.
  openApps() {
    return new Promise(resolve => {
      const giveUp = setTimeout(() => {
        this.off("apps", answer);
        resolve([]);
      }, 2000);
      const answer = apps => {
        clearTimeout(giveUp);
        resolve(apps);
      };
      this.once("apps", answer);
      this.send({ cmd: "apps" });
    });
  }

  makeDefault(device) {
    this.send({ cmd: "default", id: device.id });
  }

  setVolume(device, value) {
    this.send({ cmd: "volume", id: device.id, value });
  }

  setMuted(device, value) {
    this.send({ cmd: "mute", id: device.id, value });
  }

  // Presses a keyboard sound key: "up", "down" or "mute". It lands on
  // whatever device has the sound, same as the real keys.
  pressKey(name) {
    this.send({ cmd: "key", name });
  }
}
