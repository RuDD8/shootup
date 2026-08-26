# Duel Arena

A 1v1 first-person shooter that runs in the browser. One player creates a match
and reads out a four-character code, the other types it in on the same URL, and
you duel. Every round builds a brand-new arena and picks one random gun for
both players.

**No dependencies and no build step.** The WebSocket server is implemented
directly against Node's `http` module and Three.js is vendored into
`public/vendor/`, so a clean checkout runs with nothing but Node installed.

## Running it

```bash
node server/index.js
```

Then open the printed URL. To use a different port:

```bash
PORT=9000 node server/index.js
```

The server prints your LAN addresses on startup. If your friend is on the same
network, they can use one of those directly. For internet play, deploy to
[Railway](#deploy-on-railway) or put a tunnel in front of it (`cloudflared`,
`ngrok`, or a reverse proxy). WebSocket upgrades pass through all of these
unchanged.

## Deploy on Railway

The project is ready to deploy as-is — no build step, no env vars required
beyond what Railway sets automatically.

1. Push this repo to GitHub (or connect a local folder with the [Railway CLI](https://docs.railway.com/guides/cli)).
2. In [Railway](https://railway.com), create a **New Project → Deploy from GitHub repo** and select the repo.
3. Railway detects Node via `package.json` and runs `npm start`. The server binds to `0.0.0.0` and reads `PORT` from the environment.
4. Open the generated **Public URL** in two browsers (or send the link to your friend). Both players use that same URL — one creates, the other joins with the code.

`railway.toml` in the repo sets the start command and health check. Keep the
service at **one replica** so both players hit the same server instance; scaling
to multiple instances would split rooms across machines.

**CLI alternative** (from this folder):

```bash
railway login
railway init
railway up
railway domain   # generates a public URL
```

## Playing

One player clicks **CREATE MATCH** and shares the code (or the copied link,
which prefills it). The other enters it and clicks **JOIN**. The match starts as
soon as both are connected.

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| `Space` | Jump — you can get on top of the waist-high cover |
| Mouse | Aim |
| Left click | Shoot |
| Right click | Scope, sniper only |
| `R` | Reload |
| `Esc` | Release the mouse |

First to **7 round wins** takes the match. A round with no kill inside 90
seconds is a draw. A new match starts automatically after the last one ends.

## The guns

Both players get the **same** gun at the start of every round, chosen at random
from the four below. All are hitscan, and headshots deal 1.8x.

| Gun | Damage | Fire rate | Mag | Character |
| --- | --- | --- | --- | --- |
| Pistol | 24 | 400 rpm | 12 | Accurate, fastest movement, 5 shots to kill |
| Assault Rifle | 18 | 660 rpm | 30 | Full-auto, best all-round time-to-kill |
| Shotgun | 11 x 9 pellets | 70 rpm | 6 | Lethal point-blank, falls off hard past ~10m |
| Sniper Rifle | 90 | 45 rpm | 5 | One-shot on a headshot, slows you to 82% |

Sustained fire opens the cone of fire, which the crosshair reflects; scoping
tightens it to a quarter.

## Arenas

Each round generates a fresh 16x16 grid of 4m columns, which become full walls
or waist-high cover you can shoot over and jump onto.

Two properties are enforced rather than hoped for. Layouts are stamped with
**180-degree rotational symmetry**, so neither spawn gets the better side of the
map. And every candidate is **flood filled from one spawn** and rejected unless
it reaches the other spawn and leaves at least 42% of the interior open; any
open cell that ends up walled off is filled in, so there are no pockets that
look reachable but are not. Generation retries up to 60 times before falling
back to an empty box.

## How it fits together

```
shared/     rules imported verbatim by both sides — constants, weapons,
            arena generation, movement and raycasts
server/     wsserver.js (RFC 6455), rooms.js (codes/matchmaking),
            match.js (authoritative simulation), index.js (http + routing)
public/     browser client; js/main.js owns netcode and the render loop
test/       smoke.mjs — end-to-end test, no framework
```

The server is authoritative. It simulates at 60 Hz and broadcasts snapshots at
30 Hz; clients send input at 60 Hz. Hit detection is done entirely server-side
by raycasting against the arena grid and an upright cylinder per player, so a
tampered client cannot award itself hits.

The client predicts its own movement immediately and reconciles: each snapshot
carries the last input sequence number the server processed, the client adopts
the authoritative position, then replays every input the server has not yet
acknowledged. Any resulting correction is folded into an offset that decays over
about 80 ms instead of snapping the camera. Your opponent is rendered 90 ms in
the past so there are always two snapshots to interpolate between.

`shared/physics.js` is the reason this works: both the predictor and the
authority call the same `stepPlayer`. Movement collision treats the player as a
box rather than a true cylinder, which is slightly less accurate at corners but
identical on both machines — and agreement matters much more than precision.

Shooting is predicted locally for feel: the muzzle flash, tracer, recoil and
sound fire on your click, while damage waits for the server. Ammo is predicted
too and corrected whenever the server disagrees.

## Testing

```bash
node test/smoke.mjs
```

Boots the real server and drives it with Node's built-in WebSocket client, which
checks the hand-rolled framing against an independent implementation rather than
against itself. It covers arena connectivity across 300 generated maps, weapon
draw distribution, the create/join flow, bad codes, round start, movement,
input acknowledgement, ammo consumption, event delivery, bounds, and disconnect
handling.
