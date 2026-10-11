# Green Hell GT3 RS

**Play online:** https://kaidan933-droid.github.io/claude-game-1.0/  
Every push to `main` rebuilds and redeploys the site automatically (`.github/workflows/deploy.yml`).
The motorcycle race (with online multiplayer) is at [`bikes.html`](https://kaidan933-droid.github.io/claude-game-1.0/bikes.html); see the end of this file.

A 10-car GT3 RS race on a 12.6 km circuit inspired by the Nürburgring Nordschleife, in three.js (r170) built with Vite.

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # bundle in dist/, serve with `npm run preview`

## The race

You start 6th of 10 identical GT3 RSs. Pick 1-3 laps (a lap takes about 4:40), opponent level (Amateur / Pro / Alien),
PDK auto or manual, TC, ABS, steering help and paint on the setup screen. Standing start: five red lights, then lights out.

Controls: `W` throttle, `S` brake (hold at a standstill for reverse), `A`/`D` or `Left`/`Right` steer,
`Up`/`Down` arrows shift gears (pressing them in PDK auto switches to manual; `E`/`Q` also work), `R` reset to track,
`C` camera, `B` look back, `T` traction control, `Y` ABS, `G` gearbox auto/manual, `H` steering help, `M` mute,
`P`/`Esc` pause.
Gamepad: RT/LT throttle and brake, left stick steers, bumpers shift, Y camera, X reset. Phones and tablets get
on-screen steer, brake, gas and +/- shift buttons.

Quality: High (PCs: MSAA, bloom, 4096 shadows), Medium, Low (phones: FXAA, no bloom, lighter trees). Touch devices
start on Low; the Quality button cycles them.

## The car

The built-in GT3 RS is generated in code from a side-profile reference photo of a 992 GT3 RS (Ice Grey, Weissach
carbon parts, swan-neck wing, 10-spoke centre-lock wheels, yellow ceramic calipers). For a photo-real car, drop a
model at `public/models/gt3rs.glb`: the game fits it to the physics car, finds the wheels and the paint, and uses it for
all ten cars. See `public/models/README.md` for naming and the optional `gt3rs.json` overrides.

## The track

Clockwise, with the real sections' character: Hatzenbach esses, the Flugplatz crest (the car goes light and can leave
the ground), flat-out Schwedenkreuz, Aremberg, the Fuchsröhre dip, Adenauer Forst, Wehrseifen and Breidscheid at the
bottom of the valley, the long climb through Kesselchen, the banked concrete Karussell hairpin, Hohe Acht, Brünnchen,
the Pflanzgarten jump, Schwalbenschwanz, then a 2 km Döttinger Höhe straight. About 120 m of elevation change,
armco close to the track, Eifel forest, grandstands and spectator banks, graffiti on the asphalt.

## Physics

`src/ring/sim/car.js`, 240 Hz, the same model for you and the AI:
- 1520 kg with driver, 39/61 weight split, 525 PS / 465 Nm flat-six torque curve, 7-speed PDK ratios, LSD.
  Measured in the sim: 0-100 km/h 3.5 s, 0-200 km/h 11 s, about 290 km/h flat out, 100-0 km/h in 28 m.
- Each tyre has its own load (static split, downforce, longitudinal and lateral load transfer, crests and dips,
  banking), wheel speed, slip ratio, slip angle and temperature. Forces come from a combined-slip Pacejka-style curve,
  so braking or throttle while cornering takes lateral grip away (friction ellipse); grip falls off past the peak.
  Load sensitivity, a temperature window (cold tyres grip less, overheated ones too), and less grip on curbs, grass, gravel.
- Downforce (about 860 kg at 285 km/h) and drag; DRS opens on its own when flat out on a straight.
- ABS and traction control work per wheel and can be switched off; without them wheels lock and spin.
- Up to about 1.5 g on the flat, near 2 g on the Karussell banking.

## Sun glare

The sun is 6.5 degrees above the horizon, straight up the Döttinger Höhe. The scene renders in linear HDR; the final
pass adds a halo and starburst, hexagonal lens ghosts, veiling glare that washes out contrast, auto-exposure that stops
down when you look into the sun, and in the cockpit the windscreen grime lights up. Sun visibility is ray-marched
through tree crowns, terrain and buildings, so it strobes through the forest.

## Code

    src/ring/main.js       game loop, setup / pause / results, car visuals
    src/ring/core.js       renderer, sky, sun, fog that glows toward the sun, helpers
    src/ring/scenery.js    road, kerbs, armco, terrain, grandstands, bridges, signs, braking boards, marshal posts, sun visibility test
    src/ring/carmodel.js   procedural GT3 RS model (profile traced from a reference photo)
    src/ring/carglb.js     optional drop-in .glb car model loader
    src/ring/trees.js      branch-card spruce and beech, impostor billboards, undergrowth, wind
    src/ring/textures.js   generated PBR asphalt, kerb, grass and gravel textures
    src/ring/cameras.js    chase / close / bonnet / cockpit / TV / heli
    src/ring/post.js       bloom, glare, exposure, tone mapping, quality toggle
    src/ring/effects.js    skid marks, tyre smoke, dust, sparks
    src/ring/audio.js      synthesized flat-six, tyres, wind, curbs, impacts
    src/ring/input.js      keyboard, gamepad, touch, steering help
    src/ring/hud.js        timing, gaps, dash, tyre temperatures, g-meter, map
    src/ring/sim/          track generation and racing line, car physics, AI and race logic (no three.js;
                           runs in Node for headless tests)

The motorcycle game lives in `bikes.html` and `src/` (described below).

---

# Motorcycle race (`bikes.html`)

Motorcycle race in three.js (r170) built with Vite: 10 riders on 400cc sport bikes. You ride an Aprilia RS 457 in Prismatic Dark (a look-alike livery, not official artwork).

**Solo:** you plus 9 AI riders (Pro, Strong, Club and Rookie skill levels). The menu's *Bots* picker sets Easy (default), Medium or Hard; online, the host's choice applies.

**Track:** a fast, nearly flat 3.5 km circuit with a 790 m main straight, big sweepers and no hairpins.

**Online:** one player clicks *Host online race* and shares the invite link (or the 5-letter room code); others click *Join*. Humans take grid slots from the back forward, and each one replaces an AI rider, so there are always 10 on track. Anyone joining mid-race spectates and gets a slot next round. If a player drops out, an AI rider takes over their bike; if the host leaves, everyone finishes against the AI. Connections are peer-to-peer through the host's browser (PeerJS); some school or work networks block this.

Race: lights count down on the gantry, then 5 laps; results show when you finish.

**HD assets:** at startup the game loads real CC0 assets from [Poly Haven](https://polyhaven.com) (an HDR sky for the background and lighting, photo-scanned asphalt, grass, gravel and concrete, leather and metal detail for the riders and bikes, and tree models) through its public API, and swaps them in as they arrive. If they can't be reached, the built-in look is used. The menu's *HD assets* button turns this off. Thanks to Poly Haven for the free assets.

Controls: `W`/`Up` throttle, `S`/`Down` brake, `A`/`D` or `Left`/`Right` steer, `R` reset to track, `C` cycles cameras, `M` mutes, `Space` pauses (solo only). The Quality button switches High (bloom, speed blur) / Low.

Riding model (RS 457 class, shared by every bike):
- about 185 km/h flat out, 0-100 km/h in about 4.6 s, 6-speed automatic gearbox with a quickshifter, 100-0 km/h in about 43 m
- brake pressure builds the longer you hold the key; dual-channel ABS (lamp on the dash)
- steering asks for a lean angle: tap for a little, hold for more, up to about 48 deg on dry asphalt; it gets heavier with speed
- wheelies on hard launches (anti-wheelie holds it to about 8 deg), fork dive under braking; the rider tucks on straights, sits up to brake, hangs off and touches a knee down at deep lean
- tyre grip is a friction ellipse: braking or accelerating hard while leaned over slides the tyres and can lowside you. Curbs, grass and gravel have less grip

    src/main.js      game loop, pause
    src/core.js      renderer, scene, sky, lights, shared helpers
    src/track.js     circuit, speed profile, corners, barriers, stands
    src/scenery.js   terrain, mountains, clouds, trees
    src/models.js    RS 457 and AI sport bike models, rider, pose
    src/bikes.js     10-slot field, rider physics, AI racers (skill, passing, mistakes), contact, network state
    src/net.js       PeerJS rooms
    src/lobby.js     menu, lobby, online race flow
    src/cameras.js   chase / onboard / trackside / aerial
    src/physics.js   engine power curve, gearbox, drag, brakes, tyre and lean constants
    src/assets.js    Poly Haven HD assets (sky, textures, trees) with fallbacks
    src/post.js      bloom, speed blur, colour grade, quality toggle
    src/effects.js   tyre marks, dust, sparks
    src/audio.js     synthesized engine, tyre, wind and crash sounds
    src/hud.js       race panel, corner note, gear / lean / revs / ABS, minimap
    src/race.js      countdown, lap timing, finish order
    src/results.js   results screen
