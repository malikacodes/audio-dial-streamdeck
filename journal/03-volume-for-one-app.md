# 03 · Volume for one app

2026-10-08

Same day, new itch. The Output Dial turns everything up and down at once.
What I wanted next was Music quieter without touching anything else.

## The plugin that almost had it

Elgato's Volume Controller lists "App: control volume for a specific app",
which is why I installed it in the first place. Further down the page:

```
App control only supported on Windows at this time
```

So that was never going to work on my Mac. I hadn't read that far. Classic.

## A detour through the Action Wheel

Before giving up on it I tried to get my own dial into an Action Wheel,
thinking I could build a little menu of sound things on one knob. Audio
Dial wasn't in the list at all, even though GitHub Graph was.

That's because an Action Wheel is for **key** actions. You turn to pick one and
press to run it. GitHub Graph has keys. Audio Dial only has a dial, and so
does my Ember Mug plugin, which was missing from the same list. A wheel
also couldn't do volume anyway: the turn is used up choosing.

A **Dial Stack** is the one that takes dials. Different thing, similar
name, and I had them mixed up.

## Why a Mac makes this hard

macOS has no volume setting for one app. Apps that offer it do something
sneakier: they catch the app's sound on its way out, silence the original,
and play their own copy back quieter. That's a real-time audio engine,
which is a lot of project for "turn Music down a bit".

[FineTune](https://github.com/ronitsingh10/FineTune) already does it. It's
free, it lives in the menu bar, and it takes commands as links:

```bash
open "finetune://set-volumes?app=com.apple.Music&volume=30"
```

So the plan became: FineTune does the audio, my dial tells it what to do.

## Problem 1: testing with an app I don't have

The first link I tried was the example from FineTune's guide, for
Spotify. Nothing happened. I checked FineTune's settings file and there it
was, Spotify at 50%, saved and everything.

I don't have Spotify installed. FineTune had politely turned down an app
that doesn't exist. With Music playing and Music's name in the link, the
song dropped right away.

## Problem 2: FineTune grabbed the wrong microphone

This one had nothing to do with volume. FineTune has a setting that locks
the Mac's input to one microphone, and it was on from the start, pointed
at the MacBook's built-in mic.

I work with the MacBook closed and the ultrawide as my only screen. A
closed laptop is not a great microphone. Leak Flow, my push-to-talk voice
typing app, was suddenly listening to the wrong mic.

For about ten seconds I was sure something had hijacked my mic, Hugging
Face style. Not a rogue AI. A checkbox.

The fix was in FineTune's menu: lock the input to my USB mic instead. And
now that it's pointed at the right one I like the lock. With the lid
closed there's only one mic I ever want, and nothing can quietly switch it
on me any more.

> Heads up: if voice typing or calls go quiet right after installing
> FineTune, check which input it locked before blaming anything else.

## How the dial knows the number

FineTune takes commands but doesn't answer them. At first that looked
like the dial would have to remember what it last sent and hope.

Then I looked at that settings file again. It isn't only settings. Every
app's volume and mute is in it, and FineTune rewrites it within a second
of any change:

```
"appVolumes": { "com.apple.Music": 0.2269317 }
```

So the plugin watches the file. Commands go out as links, the truth comes
back from the file, and the strip stays right even when I drag a slider
in FineTune's own menu. For the second after a turn the dial trusts its
own number, or the strip would flick back to the old one while FineTune
is still saving.

## Did it work?

From the Terminal, yes: volume and mute both land in FineTune, and Music
gets quieter. 22 tests pass, including the one that says an app FineTune
has never touched is at 100% and not at 0.

On the real dial too. I picked Music from the app list, turned, and the
song followed. Closing an app doesn't lose it either: the dial keeps the
app it was set to, and FineTune keeps the volume.

## What I learned

Read the whole product page. And before building the hard part, check
whether somebody already built it and left the door open.

## What's next

- Stack Music, Chrome and Discord on one knob.
- FineTune's settings file also has spots for monitor volume. That might
  be a way to the LG volume I parked in entry 01. Not today.
