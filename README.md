# Palia Plant Planner

A web app that plans a garden for the game [Palia](https://palia.com/). You say how many garden plots you have and what you want from them. The planner finds a crop layout and a plot arrangement that meets those goals as well as possible.

**Use it:** https://chrise82.github.io/PaliaPlantPlanner/

Fan-made tool. Not affiliated with or endorsed by Singularity 6. Palia is a trademark of Singularity 6.

## What it does

- **Goals with importance levels.** Each goal is a crop, a measure, an amount and an importance:
  - Quantity: "at least 4 Apple plants" or "as many Wheat plants as possible".
  - Buffs: "every Apple gets Harvest Boost", or "at least 10 plants with Water Retain".
  - Importance: Must, High, Medium or Low.
- **Helper crops.** Extra crops the planner may plant to give buffs or fill space, without counting as goals.
- **Plot arrangements.** The planner compares every way to arrange your plots (1,285 for 9 plots) and suggests the best, or you can draw the arrangement you actually have.
- **Alternatives.** The best layouts on different arrangements, side by side.
- **Editing.** Change tiles by hand, lock what you like, and re-optimize the rest.
- **Seed shopping list.** Seeds needed per crop, with prices and totals.

## How the planner decides

Each importance level has two scores: one for its targets (quantity numbers and buff goals) and one for its Maximize goals. Layouts are compared in this order: Must targets, Must maximize, High targets, High maximize, Medium, then Low. The first score that differs decides. So a higher importance level takes all the space it needs before lower levels count, and within a level, targets are met before Maximize goals get space.

Maximize goals with the same importance share space evenly. If everything else is tied, the planner prefers more filled tiles, then a more compact plot arrangement, then more buffs on goal crops, then goal crops over helpers.

The search runs in your browser in Web Workers. For each arrangement it builds starting layouts, improves them with late acceptance hill climbing (which accepts a change when the result is at least as good as the current layout or as the layout from a fixed number of steps earlier), and finishes with a pass that tries every allowed 1x1 crop on every tile. It screens every arrangement quickly, spends more time on the best few dozen, and the most time on the best 3. Search time can be set to Quick, Normal or Thorough.

## Game rules it uses

Checked on 2026-09-17 against the [Palia wiki](https://palia.wiki.gg/wiki/Gardening) and the code of two existing planners, and confirmed in game:

1. A garden has 1 to 9 plots of soil, each 3x3 tiles. Plots placed against each other form one field.
2. A crop can go anywhere its whole footprint is on soil, including across the border between two touching plots.
3. Buffs pass only between orthogonally touching tiles. Diagonals and gaps give nothing.
4. A crop never receives a buff from its own crop type. A different crop with the same buff does count.
5. A 1x1 crop needs 1 touching tile that gives a buff. A 2x2 crop needs 2 and a 3x3 crop needs 3. One 2x2 neighbor along a full side counts as 2.
6. Buffs don't stack. No crop currently gives Growth Boost (only fertilizer does).

The rule values live in [`src/engine/rules.ts`](src/engine/rules.ts). Crop data lives in [`src/data/crops.json`](src/data/crops.json), with the date it was checked and its sources. If a game patch changes a crop or a rule, update those two files and run the tests.

## Development

Requires Node 24.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

```bash
npx tsx scripts/benchmark.ts
```

Project layout:

```
src/
  data/        crop data and loader
  engine/      rules, garden, buffs, scoring, prechecks, reports (no UI code)
  engine/search/  planner search (starting layouts, moves, hill climbing, arrangement screening)
  worker/      Web Worker entry and worker pool
  ui/          React components, state store, styles
scripts/       benchmark
research/      brute-force check of the arrangement examples in PLAN.md
```

[PLAN.md](PLAN.md) has the full design and the reasoning behind it.

## Deployment

Every push to `main` runs the tests, builds the site, and publishes it to GitHub Pages ([workflow](.github/workflows/deploy.yml)).

## Credits

Game rules and crop data were checked against the [Palia wiki](https://palia.wiki.gg/), [aisen's Palia Garden Planner](https://github.com/VincentAmante/palia-tools), and [garden-plot-optimizer](https://github.com/bumblebeers/garden-plot-optimizer). No code or art was copied from them.
