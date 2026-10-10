# Apex Run

**Play online:** https://kaidan933-droid.github.io/claude-game-1.0/  
Every push to `main` rebuilds and redeploys the site automatically (`.github/workflows/deploy.yml`).

Scooter race concept in three.js (r128) built with Vite.

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # bundle in dist/, serve with `npm run preview`

Race: lights count down on the gantry, then 5 laps; results show when you finish (`Enter` races again).

Controls: `W`/`Up` throttle, `S`/`Down` brake, `A`/`D` or `Left`/`Right` steer, `R` reset to track, `C` cycles cameras, `M` mutes, `Space` pauses. The Quality button switches High (bloom, speed blur) / Low.

Riding model (Vespa GTS 300 class):
- about 127 km/h flat out, 0-100 km/h in about 11 s, 100-0 km/h in about 47 m
- brake pressure builds the longer you hold the key; linked brakes with ABS (lamp on the dash)
- steering asks for a lean angle: tap for a little, hold for more. The floorboard scrapes at 35 deg and nothing goes past 39 deg (about 0.8 g)
- tyre grip is a friction ellipse: braking or accelerating hard while leaned over slides the tyres and can lowside you. Curbs, grass and gravel have less grip

    src/main.js      game loop, pause
    src/core.js      renderer, scene, sky, lights, shared helpers
    src/track.js     circuit, speed profile, corners, barriers, stands
    src/scenery.js   terrain, mountains, clouds, trees
    src/bikes.js     vespa-style scooter and rider models, AI racers (skill, passing, mistakes), contact
    src/cameras.js   chase / onboard / trackside / aerial
    src/physics.js   engine, CVT, drag, brakes, tyre and lean constants
    src/post.js      bloom, speed blur, quality toggle
    src/effects.js   tyre marks, dust, sparks
    src/audio.js     synthesized engine, tyre, wind and crash sounds
    src/hud.js       race panel, corner note, lean / revs / ABS, minimap
    src/race.js      countdown, lap timing, finish order
    src/results.js   results screen
