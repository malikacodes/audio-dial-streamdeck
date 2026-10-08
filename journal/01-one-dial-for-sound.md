# 01 · The dial that switched screens but not sound

2026-10-08

I wanted one dial for sound: turn for volume, tap to jump between my
headphones and my monitor. I thought I already had it. I did not.

## What I had

Two plugins, each doing half:

- **Volume Controller** (Elgato): an "Output Device Control" dial. One
  device per dial.
- **Audio Switcher**: a key with a Primary and a Secondary device. Press
  it and the sound moves.

So I put two Volume Controller dials in a dial stack, one for the USB
headphones and one for the LG. Tapping the stack flipped between them and
it looked right. Then I noticed the music never moved. A tap switched
screens, but it didn't switch devices.

That's all a dial stack does. It's two dials sharing one spot, and a tap
picks which one I'm looking at. Nothing in it tells the Mac to send sound
somewhere else. And Audio Switcher only comes as a key, so it can't go on
a dial at all. No setting was going to fix this one.

## Problem 1: the monitor has no volume

Before building anything I checked what the Mac thinks of each device:

```
LG ULTRAWIDE      volume: no   mute: no
USB Audio Device  volume: yes  mute: yes
```

The Mac has no volume control for the monitor at all. Over HDMI it sends
full volume and the monitor's own buttons do the rest. So half of my old
dial stack was a volume dial for something with no volume.

There's a way around that called DDC, where you send commands down the
display cable to the monitor itself. I installed `m1ddc` to try it:

```
[1] LG ULTRAWIDE (1EA6E72D-F18A-47EF-0857-D6964E3302DB)
DDC communication failure: (iokit/?) unknown subsystem error
```

It found the monitor and then the monitor ignored everything, brightness
included. That points at the cable or adapter, not at anything I can fix
in code. I uninstalled it and moved on. The dial still switches to the
monitor, and the strip just says "Volume on the device".

## How it works

A Stream Deck plugin is JavaScript, and JavaScript has no way to reach
the part of macOS that owns sound devices. Swift does. So there are two
programs:

```
dial  <->  plugin (Node)  <->  helper (Swift)  <->  macOS
```

The helper is like a walkie-talkie. The plugin says "make this the
output" or "set this to 40", and the helper answers with the whole list
of devices. It also talks on its own whenever something changes, so when
I press the volume keys on my keyboard the strip keeps up.

## Problem 2: my headphones have a port in their name

The id the Mac gives my headphones is:

```
AppleUSBAudioEngine:GeneralPlus:USB Audio Device:1123000:1
```

That `1123000` is the USB port. Plug them in somewhere else and it's a
different id, and the dial would say "not connected" while they're
playing. So devices are matched by id first, then by name, and when the
name is what matched, the new id gets saved. Audio Switcher has a "Device
matching" setting for the same reason, which I never understood until now.

## Did it work?

Through the helper, yes: switch to the LG and back, volume up and down,
mute, all checked from the Terminal, and it refuses a made-up device
politely. 14 tests pass for the switching and matching logic.

On the actual dial: not yet. That's next, along with deleting the old
dial stack. It had a good run, sort of.

## What I learned

A dial stack switches what I see, not what the Mac does. And check what
the device can actually do before building a control for it.
