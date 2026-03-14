1. Branching model
main

Always demo‑ready, only merged via PR after review.

dev (optional but helpful)

Integration branch for the current sprint; merge feature branches here first, then to main when stable.

Feature branches

Named per sprint + block + owner, for example:

feat/s1-b1-server-scaffolding

feat/s3-b2-radar-ui

Workflow per feature:

Create branch from dev.

Implement block.

Open PR into dev.

One other teammate reviews & approves.

After sprint is tested, merge dev → main.

2. Role split for 3 members
Assume:

Dev A (Member A / Backend) – Uses feat/sX-bY-... branches
Dev B (Member B / Frontend) – Uses feat/sX-bY-... branches
Dev C (Member C / Integration) – Uses feat/sX-bY-... branches

Repo URL: https://github.com/Samir1s/Demo-Hunt.git

3. Sprint‑by‑sprint branch plan
Sprint 1 – Infrastructure & Connectivity
Dev A (backend)

feat/s1-b1-server-scaffolding – Block 1.1

feat/s1-b2-room-logic – Block 1.2

Dev B (frontend)

feat/s1-b3-frontend-shell – Block 1.3

Dev C (integration)

feat/s1-b4-websocket-bridge – Block 1.4

Depends on A’s and B’s branches; start once basic server + shell exist.

Merge order for Sprint 1:

A’s branches → dev

B’s branch → dev

C’s bridge branch → dev

Test with 2–3 phones → merge dev → main

Sprint 2 – Secret Roles & Transitions
Dev A

feat/s2-b1-role-assignment-engine – Block 2.1

feat/s2-b2-private-role-events – Block 2.2

Dev B

feat/s2-b3-role-reveal-ui – Block 2.3

Dev C

Helps test end‑to‑end (no separate branch needed unless refactoring).

Can add unit/integration tests on a small branch:

chore/s2-tests-role-flow

Sprint 3 – Radar & Movement
Dev A

feat/s3-b1-coordinate-system – Block 3.1

Dev B

feat/s3-b2-radar-engine-ui – Block 3.2

Dev C

feat/s3-b3-mock-movement – Block 3.3

Hooks joystick/touch into the positionUpdate client API that A defined.

This lets A and B work in parallel (protocols agreed in advance), while C glues interaction into the radar.

Sprint 4 – Proximity & Combat
Dev A

feat/s4-b1-proximity-engine – Block 4.1

feat/s4-b3-catch-accuse-logic – Block 4.3

Dev B

feat/s4-b2-alert-ui-effects – Block 4.2

UI for flashes, text, timers; uses events from A.

Dev C

Integration testing branch: chore/s4-integration-tests

Scenario scripts: enter game, move, trigger alert, catch, accuse.

Sprint 5 – Game Loop Finalization
Dev A

feat/s5-b1-win-conditions – Block 5.1

feat/s5-b3-round-timer-server – Block 5.3

Dev B

feat/s5-b2-game-over-screen – Block 5.2

Dev C

Small branch feat/s5-b3-timer-ui to render timer updates from server.

General UX smoothing: labels, messages, error states.

Sprint 6 – Demo Polish & Deployment
Dev A

chore/s6-deployment-setup – hosting, envs, basic logging.

Dev B

feat/s6-b2-theme-and-glitch – Upside Down theme, glitch CSS, sound hooks.

Dev C

feat/s6-b1-qr-join – QR generation on lobby.

chore/s6-b3-stress-sim – simple “bot players” or scripts to simulate 10+ clients.

4. Collaboration rules (important)
Every branch must:

Have a clear scope matching a Block.

Include at least one other member’s review before merging into dev.

Never develop directly on main or dev.

Keep branches short‑lived (1–2 days max) to reduce merge conflicts, which is standard for game teams using agile + Git.