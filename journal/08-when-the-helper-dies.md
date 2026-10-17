# 08 · When the helper dies

2026-10-17

The Swift helper is the only thing that knows what my Mac's sound is
doing. If it died, the plugin logged a line, started it again two seconds
later, and the dial carried on showing the last volume it had heard. It
looked fine and did nothing. Very supportive of it.

## Three things I changed

- **Junk that is still valid JSON.** A line like `null` or `{}` parses
  fine and then blew up inside the handler. That's the kind of error that
  closes the plugin without a word. Now anything that isn't a device list
  or an app list is logged and skipped.
- **A dead helper shows.** When it stops, I clear everything it told me,
  tell the strip, and the strip says "Audio helper is off". Tapping the
  strip says the same, because "not connected" would be the wrong reason.
- **Retries slow down.** If the helper can't start at all (say I never ran
  `npm run helper`), it used to be tried every two seconds forever. Now
  each failure in a row waits twice as long, up to 30 seconds, and one
  good report puts it back to two.

```
helper dies → clear devices → strip: "Audio helper is off" → wait 2s, 4s, 8s... → try again
```

## What I decided not to do

I looked at only starting the helper while a dial is on screen. It would
save almost nothing and add a way to be wrong about when it's running, so
it stays on all the time and I made its failure visible instead.

## What I learned

An empty list can mean two things: no speakers, or nobody told me. The
strip needs its own flag for the second one.

Next: FineTune's watcher, which has the same habit of failing quietly.
