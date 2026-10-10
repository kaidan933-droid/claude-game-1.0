# Apex Run

Scooter race concept in three.js (r128) built with Vite.

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # bundle in dist/, serve with `npm run preview`

Race: lights count down on the gantry, then 5 laps; results show when you finish (`Enter` races again).

Controls: `W`/`Up` throttle, `S`/`Down` brake, `A`/`D` or `Left`/`Right` steer, `R` reset to track, `C` cycles cameras, `Space` pauses.

    src/main.js      game loop, pause
    src/core.js      renderer, scene, sky, lights, shared helpers
    src/track.js     circuit, speed profile, corners, barriers, stands
    src/scenery.js   terrain, mountains, clouds, trees
    src/bikes.js     vespa-style scooter and rider models, AI racers (skill, passing, mistakes), contact
    src/cameras.js   chase / onboard / trackside / aerial
    src/hud.js       race panel, corner note, gears, minimap
    src/race.js      countdown, lap timing, finish order
    src/results.js   results screen
