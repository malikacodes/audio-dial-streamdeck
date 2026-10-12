# 05 · A volume for the monitor

2026-10-12

The LG has been "Volume on the device" since entry 01. Today the dial
turns it. Getting there started with a robot.

## First, the robot

Chrome started sounding like an alien was reading the video to me. The
App Volume dial changed the number on the strip and the loudness stayed
exactly where it was. F11 and F12 did nothing at all.

I blamed my dial first. Then I moved the slider in FineTune's own menu
and got the same robot, so the dial was only the messenger.

The fix was to quit FineTune and open it again. Everything came back:
clean voice, working volume, working keys. FineTune had been open since
I logged in that morning, and my guess is it grabbed the sound before the
monitor had finished waking up. I can't prove that yet.

> Heads up: if apps sound robotic through FineTune, restart FineTune
> before taking anything else apart.

## The keys turn the LG now

With FineTune healthy again, F11 and F12 moved the LG's volume. macOS
still says the monitor has none. FineTune was doing it: it turns the
sound down itself before it ever reaches the monitor.

> So can the dial just tell FineTune a number, like it does for an app?

No. I listed the commands inside the app:

```bash
strings -a /Applications/FineTune.app/Contents/MacOS/FineTune | grep -E "^[a-z]+(-[a-z]+)+: "
```

Five commands came back (`set-volumes`, `step-volume`, `set-mute`,
`toggle-mute`, `set-device`) and every one of them wants an app. Nothing
for a device.

But FineTune listens for the volume keys. So the dial presses them.

```
dial click → helper presses F11 → FineTune turns the LG down
                                        ↓
strip  ←  plugin reads the number  ←  settings.json
```

## Problem 1: the presses only landed sometimes

I wrote a tiny program that pressed volume down once and quit. The first
try worked. Then fourteen presses in a row moved the volume three times.

The program was quitting before macOS had delivered the press. It's like
dropping a letter at the post office and burning the building down on the
way out. With a short wait before quitting, six presses out of six
landed:

```
start 100
key 1 -> 93
key 1 -> 87
key 1 -> 81
key 0 -> 87
key 0 -> 93
key 0 -> 100
```

The real helper never quits, so it never had the problem. I lost a while
to a bug that only existed in my test.

## Problem 2: the number in the file looked wrong

One press down from full and FineTune saved this for the LG:

```
0.87890625
```

Not 94%, which is what one notch down should be. It took me a minute:
that's 0.9375 times 0.9375. FineTune saves the loudness, and the loudness
is the slider squared. The slider has 16 notches, one press moves one
notch, and the square root of the saved number gives the slider back.

## Problem 3: it worked and felt awful

On the real dial the LG went up and down, and it felt like turning a knob
through honey. Click, wait, then the number moved. FineTune takes about
half a second to save, and the strip was waiting for the file.

Since a click is always exactly one notch, I don't need to wait. The
strip shows the number it expects right away, and a second and a half
after I stop it checks against the file. The app dial already did the
same thing for the same reason.

It skips the guess in two spots: coming out of mute (the file says 0
while muted, so I can't see where it will come back to), and when
FineTune's step setting isn't "normal", because that's the only size I
measured.

## One more thing the helper needed

The strip should go back to "Volume on the device" when FineTune is
closed. The helper asks macOS to tell it when an app opens or quits, and
at first it never heard a thing. Those notices only reach a program
that's running a "run loop" (the thing that sits and waits for the
system to call). Mine was waiting a different way. One line changed.

## Did it work?

Yes, on the real dial: turn for volume, press to mute, and the number
moves with my hand. 32 tests pass.

What it costs:

- A click on the LG is one of FineTune's notches, about 6%, not the step
  size in my dial's settings.
- FineTune has to be open, with its media keys setting on.
- macOS has to allow Stream Deck to press keys. If it doesn't, the strip
  says "Keys not allowed".

## What I learned

When an app has no door for what I want, check what it already listens
to. FineTune had no command for my monitor and was listening to my
keyboard the whole time.

## What's next

- See whether the robot comes back after a restart. If it does every
  time, FineTune needs to open a little later at login.
- The old dial stack is still on my Stream Deck. It can go now.
