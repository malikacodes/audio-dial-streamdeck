# 02 · First run on the real dial

2026-10-08

Entry 01 ended with everything working from the Terminal and nothing
tried on the actual Stream Deck. So I dragged Output Dial onto the dial
and picked my two devices.

It worked first time, which I don't fully trust, but here we are 🎉

- The Primary and Secondary lists showed every output on the Mac.
- Turning moves the headphone volume.
- A tap sends the sound to the other device and the strip changes its
  name with it.
- A press mutes.

## The LG was choppy

The one thing that went wrong wasn't the dial. When I tapped over to the
LG ULTRAWIDE the sound came out choppy, like it kept dropping tiny pieces.
I swapped Secondary to another external speaker I have and that one
played perfectly.

I don't know the cause yet. All the dial does is tell the Mac "this is
the output now", the same thing the menu bar does, so my guess is the
connection to the monitor. That's the same cable or adapter that refused
every DDC command in entry 01, so it's already on my list of suspects. To
check: pick the LG from the menu bar with the plugin out of the picture
and listen. If it's still choppy, it's the cable.

The good news is the pickers did what they were for. The LG was only ever
my example, and changing to a different speaker was one dropdown.

## The icon took three tries

The first dial icon filled the whole circle and looked huge next to my
GitHub dial. The second one overcorrected and looked like it was standing
far away. For the third I looked at how the GitHub one does it: the
picture has empty space built in around the drawing, so the drawing takes
up about 40% of the circle. Same numbers, and now they match.

## What I learned

Test on the real thing early. The Terminal told me the switch worked. It
could not tell me the monitor would sound like a skipping CD.

## What's next

- Find out if the LG is choppy without the plugin.
- If I change the cable for that, try DDC again. Monitor volume from the
  dial is still parked on it.
