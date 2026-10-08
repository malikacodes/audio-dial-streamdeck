// Starts the Swift helper (bin/audio in the plugin folder) and keeps the
// latest list of output devices it reported. Everything the dial knows
// about sound on this Mac comes through here.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";

const RESTART_MS = 2000;

export class Audio extends EventEmitter {
  devices = [];

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
      try {
        this.devices = JSON.parse(line).devices;
      } catch {
        this.logger.warn(`Helper sent something that isn't JSON: ${line}`);
        return;
      }
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

  makeDefault(device) {
    this.send({ cmd: "default", id: device.id });
  }

  setVolume(device, value) {
    this.send({ cmd: "volume", id: device.id, value });
  }

  setMuted(device, value) {
    this.send({ cmd: "mute", id: device.id, value });
  }
}
