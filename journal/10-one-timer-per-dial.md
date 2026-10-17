# 10 · One timer per dial

2026-10-17

After I turn the Output Dial, the strip shows the number I asked for, and
a timer redraws it a moment later with what the device really says. There
was one timer for the whole plugin.

## What that meant

I stack dials, and sometimes have more than one Output Dial. Turn one,
turn another, and the second dial's turn cancelled the first one's timer.
The first strip stayed on its guess until something else redrew it.
Every dial now keeps its own timer, in a map by dial id, the same way the
plugin already keeps their settings and pictures.

## After a dial leaves

Timers and redraws could also land after a dial had left the screen and
put its picture back in the plugin's memory for good. A dial that has
gone now has no timer, and drawing for one that isn't on screen does
nothing. The redraw timers that used to swallow their errors now say what
went wrong, like the other redraws do.

## What I couldn't test

`src/index.js` is the one file that talks to Stream Deck, so the tests
can't load it. I checked this change by reading it, running the pretend
deck, and having it looked over by something that wasn't me. That's a
real gap, and it's why the logic I can pull out stays out of that file.

## What I learned

A reviewer found a timer that could still be set while a dial was on its
way out. Small, harmless, and fixed. Checking the exit path is a
different job from checking the happy path.

Next: a few names that say the wrong thing.
