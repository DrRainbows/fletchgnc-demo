# FletchGNC demo

A guided crossbow bolt in the browser. Six-degree-of-freedom flight, proportional navigation, and a live view of the shot.

The book and the private reference stack are not in this repo. This is the demo an agent can install and run.

## Run

```
npm install
npm run dev
```

Vite opens the simulator. `npm test` runs the headless checks.

## For an agent

Start at `js/sim/`. `physics.js`, `gnc.js`, and `world.js` are the flight. `js/app/` is the shell. Do not add API keys. Do not commit `node_modules` or `dist`.
