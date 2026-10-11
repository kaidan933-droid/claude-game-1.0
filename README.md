# Apex Run

**Play online:** https://kaidan933-droid.github.io/claude-game-1.0/  
Every push to `main` rebuilds and redeploys the site automatically (`.github/workflows/deploy.yml`).

Motorcycle race in three.js (r170) built with Vite: 10 riders on 400cc sport bikes. You ride an Aprilia RS 457 in Prismatic Dark (a look-alike livery, not official artwork).

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # bundle in dist/, serve with `npm run preview`

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
