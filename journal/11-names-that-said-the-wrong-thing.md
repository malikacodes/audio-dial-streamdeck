# 11 · Names that said the wrong thing

2026-10-17

Last cleanup in this round, and the quietest one: no behaviour changed.

## What I fixed

- `mine` in the FineTune file held my recent changes for apps and for
  devices, so it's `myChanges` now.
- The timer that waits before re-reading the file was `settling`, and the
  dials' redraw timers were `settle`. Same idea, two words. It's `settle`.
- The Output Dial was just `dial` next to `appDial`. It's `outputDial`.
- The "is my own change still newer than the file?" check was written out
  twice, once for apps and once for devices. It's one small method now,
  `recent`, and the tests that check the edge at exactly 1.5 seconds
  didn't need to change.

## How I kept it honest

Each rename is its own commit, so if one of them hid a mistake it's easy
to see which. The tests already covered the trust window, and that's why
this could be a boring PR instead of a scary one.

## What I learned

Cleanup is the cheap part once the tests exist. Doing the tests first was
the work.
