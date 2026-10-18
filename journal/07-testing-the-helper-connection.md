# 07 · Testing the part that talks to the helper

2026-10-17

The file that starts the Swift helper and listens to it had no tests at
all. Everything the dial knows about sound goes through it, so it was the
first thing to cover before changing anything.

## The stand-in

I can't test against the real helper, because it changes the volume on my
Mac. So the tests write a tiny script into a temp folder that pretends to
be it: print this line, stay quiet, or print junk and quit. The plugin
can't tell the difference, which is the whole point.

```
test → writes fake helper script → Audio spawns it → reads its lines
```

## What's covered

- A report from the helper lands in the device list.
- Asking for the open apps gets `[]` after two seconds if nobody answers.
- A line that isn't JSON is logged and skipped, and a helper that quits is
  started again exactly once.

The two second waits don't run for real. Node's test clock jumps forward
by hand, so the tests finish in milliseconds. I got to use "exactly once"
as a test name, which felt good.

## What I learned

Checking "it only restarted once" is harder than it sounds, because a
second restart would arrive a little late and the test would already be
done. The test now spins a while and ticks the clock again before it
believes the count.

No source changed in this one. Next: what the strip does when the helper
dies, which today is nothing.
