# Audio Dial

Sound on my Stream Deck +, on dials. One dial turns the volume and taps
the sound over to my other device. A second kind of dial turns the volume
of a single app, so Music can be quiet while a call stays loud.

I made it because I had two things that each did half the job. Elgato's
Volume Controller gave me a volume dial per device, and Audio Switcher gave
me a key that toggles between a primary and a secondary device. I had the
two volume dials in a dial stack, and tapping the stack changed which dial
I was looking at, but the sound stayed exactly where it was. So I'd be
turning the "LG" dial with the music still in my headphones. Very calming.

The app dial came later, for a similar reason: Volume Controller can do
volume per app, but only on Windows.

## Output Dial

- **Turn:** volume of whatever is playing sound right now, 3% a click by
  default.
- **Tap the strip:** switch between Primary and Secondary. If something
  else has the sound, a tap goes to Primary.
- **Press:** mute and unmute.
- **Strip:** the device name, the volume, and two dots showing which of my
  two devices I'm on. It follows changes from anywhere, so the keyboard
  volume keys and the menu bar update it too.

Primary, Secondary and the step size are in the dial's settings, along
with a color for the volume bar and one for the dot. The lists show every
output device the Mac has.

## App Volume

- **Turn:** one app's volume.
- **Press:** mute and unmute that app.
- **Strip:** the app's name and its volume.

The app, the step size and the bar color are in the dial's settings. The
app list is whatever is open at that moment, so open the app first.

There's no tap on this one on purpose. In a dial stack the stack takes a
gesture for itself to move between dials, and this is the dial I stack:
Music, Chrome and Discord on one knob.

It needs [FineTune](https://github.com/ronitsingh10/FineTune), a free menu
bar app, installed and running (`brew install --cask finetune`). macOS has
no volume setting for a single app, so something has to catch each app's
sound and play it back quieter, and FineTune already does that well. I
didn't want to write a real-time audio engine to turn Music down. The dial
sends FineTune its commands and reads the numbers back from FineTune's
settings file, so the strip is right even when I move a slider in
FineTune's own menu.

## Setup

Mac only. It needs Stream Deck 7.1 or newer, Node, and Xcode's command
line tools (for `swiftc`).

```bash
npm install
npm run helper
streamdeck link com.malikacodes.audio-dial.sdPlugin
```

`npm run helper` compiles `helper/audio.swift` into the plugin folder. The
compiled file isn't in the repo, so this step isn't optional. `streamdeck`
is Elgato's CLI (`npm install -g @elgato/cli`). After that, Output Dial is
in the action list under Audio Dial, next to App Volume. Drag it onto a
dial and pick the two devices.

## How it's put together

Node can't talk to macOS audio, so there's a small Swift program
(`helper/audio.swift`) that can. The plugin starts it once and keeps it
running. The plugin sends it one-line commands ("make this the output",
"set this volume") and it answers with the full list of devices. It also
speaks up on its own whenever anything changes, which is how the strip
stays right when I use the volume keys.

I went with one long-running helper instead of running a command per dial
click because a fast spin is a lot of clicks, and because the helper has
to stay alive to hear changes anyway.

The switching and matching logic is in `src/devices.js` with no Stream
Deck or macOS in it, so `npm test` can check it with plain lists.

## Things to know

- **My monitor has no volume.** macOS reports no volume or mute control for
  the LG ULTRAWIDE over HDMI: the Mac sends it full volume and the
  monitor's own buttons decide the rest. On a device like that the dial
  still switches to it, and the strip says "Volume on the device".
- I tried controlling the monitor directly with `m1ddc` (DDC, commands
  sent down the display cable). The monitor showed up and then refused
  everything, brightness included, so it's my cable or adapter. Not built.
- Devices are matched by id first and by name second. A USB device's id
  has the port in it, so without the name my headphones would count as
  "not connected" every time I moved them to another port.
- It only changes the output device. The device for alert sounds and the
  microphone are left alone.
- App Volume does nothing without FineTune, and FineTune needs the Screen
  & System Audio Recording permission. If FineTune isn't installed the
  strip says so.
- App Volume stops at 100%. FineTune can boost an app past that, and the
  strip will show a boosted number, but the first turn brings it back to
  100 or under.
- Two devices only, and there's no installable package yet. It runs
  straight from this folder.
