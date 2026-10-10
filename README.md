# Green Hell GT3 RS

**Play online:** https://kaidan933-droid.github.io/claude-game-1.0/  
Every push to `main` rebuilds and redeploys the site automatically (`.github/workflows/deploy.yml`).
The original scooter race is still there at `scooter.html`.

A 10-car GT3 RS race on a 12.6 km circuit inspired by the Nürburgring Nordschleife, in three.js (r128) built with Vite.

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # bundle in dist/, serve with `npm run preview`

## The race

You start 6th of 10 identical GT3 RSs. Pick 1-3 laps (a lap takes about 4:40), opponent level (Amateur / Pro / Alien),
PDK auto or manual, TC, ABS, steering help and paint on the setup screen. Standing start: five red lights, then lights out.

Controls: `W`/`Up` throttle, `S`/`Down` brake (hold at a standstill for reverse), `A`/`D` or `Left`/`Right` steer,
`E`/`Shift` upshift, `Q`/`Ctrl` downshift, `R` reset to track, `C` camera, `B` look back, `T` traction control,
`Y` ABS, `G` gearbox auto/manual, `H` steering help, `M` mute, `P`/`Esc` pause.
Gamepad: RT/LT throttle and brake, left stick steers, bumpers shift, Y camera, X reset. Touch: bottom corners are
brake/throttle, top halves steer.

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
    src/ring/scenery.js    road, curbs, armco, terrain, forest, grandstands, bridges, signs, sun visibility test
    src/ring/carmodel.js   procedural GT3 RS model
    src/ring/cameras.js    chase / close / bonnet / cockpit / TV / heli
    src/ring/post.js       bloom, glare, exposure, tone mapping, quality toggle
    src/ring/effects.js    skid marks, tyre smoke, dust, sparks
    src/ring/audio.js      synthesized flat-six, tyres, wind, curbs, impacts
    src/ring/input.js      keyboard, gamepad, touch, steering help
    src/ring/hud.js        timing, gaps, dash, tyre temperatures, g-meter, map
    src/ring/sim/          track generation and racing line, car physics, AI and race logic (no three.js;
                           runs in Node for headless tests)

The scooter game lives in `scooter.html` and `src/`.
