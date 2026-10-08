# 04 · Stuck between two volumes

2026-10-08

The Output Dial felt janky on my USB headphones and nowhere else. Some
clicks did nothing. Then one would jump. Turning it was like pushing a
shopping cart with one bad wheel.

## Finding it

Since only one device did it, I stopped looking at the dial and looked at
the device. I asked it for every volume from 56 to 72, one percent at a
time, and wrote down where it actually ended up:

```
54, 59, 64, 69
```

That's it. Four answers for seventeen questions. The headphones only have
a real volume level every 5%, and anything in between gets rounded to the
nearest one.

## Why that broke the dial

Each click, the dial did this:

1. Ask the device where it is. (64)
2. Add 3. (67)
3. Send that.

On a device with fine levels, that's perfect. On this one, 67 isn't a
real level. Sometimes it rounds up to 69 and the click feels too big.
With a smaller step it rounds back down to 64, and then the next click
asks the device where it is, hears 64 again, and asks for the very same
thing. The dial could do that all day.

## The fix

While I'm turning, the dial now remembers what it last **asked for** and
starts the next click from there, instead of from what the device says.

```
click 1: ask for 67   device says 64
click 2: ask for 70   device says 69
click 3: ask for 73   device says 74
```

The asks keep adding up until they cross the next real level, so the dial
can't get trapped. It forgets the ask about a second and a half after I
stop, so if I change the volume from the keyboard in between, the dial
picks up from the real number. The one exception is a device that hasn't
moved at all since the last click: that's the trapped case, and waiting
doesn't fix it, so the ask is kept.

The strip shows what I'm asking for while I turn, then settles on the
device's real number. There's a small snap at the end (67 becomes 69).
Setting the step size to 5% on that dial makes the snap go away, since
every click is then exactly one real level.

## What I learned

The first version of this was built on a hidden guess: that a device can
be set to any number from 0 to 100. Mine can't. Ask the hardware what it
can do before deciding how to talk to it. (Yes, that's the same lesson as
the monitor in entry 01. It keeps finding me.)

## What's next

An exam, in a couple of days. So naturally I spent today teaching a dial
about headphones. The dial is ready. I'll report back on the exam.
