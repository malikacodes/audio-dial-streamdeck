# 09 · The watcher that gave up

2026-10-17

The App Volume dial reads FineTune's settings file to know the real
number. The part that notices the file changing had two ways to go quiet
and never come back.

## What was wrong

- If FineTune's folder wasn't there when the plugin started (I hadn't
  installed it yet, or never opened it), the watcher failed once and was
  never tried again. Install FineTune later and the dial followed only its
  own changes for a second and a half, then slid back to 100%.
- A file that couldn't be read was dropped with no message at all.

## What I did

Tests first, for the part that decides whether to believe me or the file:
inside the 1.5 seconds, exactly at 1.5 seconds, and with no settings file
at all. Those passed on the old code, which was the point.

Then the watcher looks for the folder again every 10 seconds until it's
there, reads the file when it finds it, and tells the strip. An unreadable
file is logged. A watcher that errors is let go and replaced.

## The part I got wrong first

I assumed deleting the folder would raise an error on the watcher. It
doesn't. macOS reports it as a change to the folder's own name, which my
filter for "only settings.json" threw away, so the watcher sat there deaf.
I found it by deleting a folder under a watcher and printing what came
out, which is a nicer way to learn than guessing.

```
folder deleted → "change p-abc123" (the folder's own name) → not settings.json → ignored
```

Now every event checks that the folder still exists.

## What I learned

Don't write the error path for the failure I imagine. Make the failure
happen and see what the computer actually says.

Left alone on purpose: the 100 ms wait before reading after a change, and
watching the folder instead of the file.
