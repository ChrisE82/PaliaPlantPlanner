# Palia Garden Planner: Plan

Status: plan for review, 2026-09-17. Design decisions come from the Q&A. Game rules and crop data were researched and checked against the code of two existing Palia planners (sections 3 and 8). The project owner confirmed the rules in section 3.

## 1. What the tool does

A web page where a Palia player enters:

- how many garden plots they have (1 to 9, each 3x3 tiles),
- a list of goals, each with an importance level,
- extra crops the planner may use as helpers,

and gets back a filled garden layout plus a plot arrangement that meets the goals as well as possible. The player can compare alternatives, see a seed shopping list, edit and lock plants, and re-optimize the rest.

### Existing tools

| Tool | What it does |
|---|---|
| [Palia Garden Planner](https://palia-garden-planner.vercel.app/) by aisen ([code](https://github.com/VincentAmante/palia-tools), MIT for the planner code) | The most used planner. Manual placement; shows buffs, harvest value, and schedules. |
| [paliagardenplanner.com](https://paliagardenplanner.com/) | Manual placement, based on aisen's planner. |
| [garden-plot-optimizer](https://github.com/bumblebeers/garden-plot-optimizer) (MIT) | Generates layouts automatically with hill climbing / simulated annealing, maximizing gold per day or crops per day. Supports pinned crops and reads/writes aisen's save codes. |

What this tool adds: goals per crop by plant count and by buff coverage, importance levels, helper crops, plot arrangement suggestions, alternatives side by side, and a seed shopping list.

## 2. Decisions from the Q&A

| Topic | Decision |
|---|---|
| Target unit | Number of plants |
| Goal model | One list. Each goal = crop + measure (Quantity or one buff) + amount + importance |
| Importance | Must / High / Medium / Low. Must is a hard requirement; the tool warns when it can't be met |
| Competing goals | Higher importance takes all: a lower level only counts when the higher levels are tied |
| Plot arrangement | The tool suggests the best arrangement; the user can draw their own instead |
| Platform | Shareable static web app that also works on phones |
| First version | Edit + lock + re-optimize, seed shopping list, compare alternatives |
| Later | Save and share layouts as links or images |

## 3. Game rules the planner uses

Confirmed 2026-09-17 from the Palia wiki's Gardening page and from the code of aisen's planner (updated August 2026) and garden-plot-optimizer (updated September 2026). Both tools implement these rules the same way.

1. **Plots.** A player has 1 to 9 plots of soil, each 3x3 tiles. Plots placed flush against each other form one continuous field.
2. **Placement.** A crop can go anywhere its whole footprint is on soil, including across the border between two touching plots. A gap between plots has no tiles, so nothing can be placed there.
3. **Buff range.** Buffs pass only between orthogonally touching tiles: not diagonally, and not across a gap. Plot borders don't block them.
4. **Own type.** A crop never receives a buff from a crop of its own type. A different crop with the same buff does count: a Potato gives Water Retain to a neighboring Tomato.
5. **Giving.** Every tile of a crop gives its buff to each touching tile of a different crop type. There is no minimum for giving.
6. **Receiving.** A 1x1 crop gets a buff when at least 1 touching tile gives it. A 2x2 crop needs 2 and a 3x3 crop needs 3. The count is tile contacts on any side, so one 2x2 neighbor along a full edge counts as 2.
7. **No stacking.** A crop either has a buff or it doesn't. Fertilizer for a buff the crop already gets from neighbors adds nothing.
8. **Growth Boost.** No crop gives it (see section 8).

Example for rule 6:

```
.  C  C  .  .     A = one Apple tree (3x3)
.  A  A  A  .     C = Corn, W = Wheat (both give Harvest Boost)
W  A  A  A  .
.  A  A  A  .     3 of the apple's touching tiles give Harvest Boost,
.  .  .  .  .     so the apple gets it. With 2 it would not.
```

The rule values live in one file, `engine/rules.ts` (receive counts by size, own-type exclusion, whether crops may cross plot borders). A game patch then means editing that file, not the planner code.

**Confirmed by the project owner** from playing the game (2026-09-17).

One detail is still unverified: whether a plot can be placed offset by 1 or 2 tiles from its neighbor. Players report it and aisen's planner allows it. It only affects "Draw my own".

## 4. Goals and scoring

### 4.1 Goal rows

| Field | Values |
|---|---|
| Crop | One crop, or "All goal crops" (buff measures only) |
| Measure | Quantity, or a buff that some allowed crop gives: Water Retain, Weed Block, Harvest Boost, Quality Boost. (No crop gives Growth Boost at the moment; see section 8.) |
| Amount | Quantity: a number (at least N plants) or Maximize. Buff: All (every plant of that crop) or a number (at least N plants of that crop with the buff) |
| Importance | Must, High, Medium (default for new rows), Low |

**Helpers** are crops the planner may plant anywhere. They earn no score by themselves. The planner uses them when their buffs help a goal, or to fill space.

A crop that appears in any goal row is allowed even if it is not listed as a helper.

Example from the Q&A:

```
Apple | Quantity      | 4        | Must
Apple | Harvest Boost | All      | High
Wheat | Quantity      | Maximize | Medium
Apple | Quality Boost | All      | Low
Helpers: Carrot, Onion, Corn
```

With these inputs the precheck (4.4) warns that no allowed crop gives Quality Boost. Wheat and Corn give Harvest Boost, so wheat planted next to the apples helps the High goal and the Medium goal at the same time.

### 4.2 How each goal is scored (0 to 100%)

| Goal | Score |
|---|---|
| Quantity, number N | min(plants, N) / N |
| Quantity, Maximize | tiles covered by that crop / all garden tiles. Using tile area puts crops of different sizes on the same scale. The goal summary shows the plant count, not this number. |
| Buff, All | plants of that crop with the buff / plants of that crop (0% if there are none) |
| Buff, number N | min(plants of that crop with the buff, N) / N |

### 4.3 Comparing two layouts

Each importance level has two scores:

- **Targets:** the sum of the scores of its Quantity-number goals and buff goals.
- **Maximize:** the sum of the square roots of the scores of its Maximize goals. The square root makes an even split worth more than giving all the space to one goal, so Maximize goals with the same importance share space by tile area. With a single Maximize goal it changes nothing.

Two layouts are compared one score at a time in this order: Must targets, Must maximize, High targets, High maximize, Medium targets, Medium maximize, Low targets, Low maximize. The first score that differs decides which layout is better. So a level's targets are met before its Maximize goals get space, and a higher level takes all the space it needs before lower levels count. This is what "higher importance takes all" means.

If all of these are tied, these tie-breakers apply in order:

1. More tiles filled.
2. More buffs received by goal crops in total, including buffs no goal asked for.
3. More tiles used by goal crops rather than helpers.

Consequences the UI must explain:

- A High "Maximize" goal can leave no space for Medium and Low goals. The results panel explains each shortfall, for example: "Wheat: 0 plants. The space went to Apple · Quantity · Maximize (High)."
- Quantity numbers mean "at least". The planner may plant more of a goal crop when nothing more important needs the space.
- A Must goal below 100% is shown as a warning with the reason when known, for example: "10 apple trees need 10 plots; you have 9."

### 4.4 Checks before solving

These run instantly while the user edits goals:

- **Capacity:** Quantity targets that cannot fit in the chosen number of plots.
- **Missing providers:** a buff goal where no allowed crop gives that buff. The message names the crops that do, for example: "No allowed crop gives Quality Boost. Add Cotton, Spicy Pepper or Rockhopper Pumpkin as a helper."
- **Contradictions:** for example a buff goal on a 3x3 crop when there is only one plot, so the crop has no neighbors.

## 5. Planner (optimizer)

### 5.1 Layout representation

Crops can cross plot borders, so the planner treats the garden as one set of tiles. Plot outlines are drawn only for reference.

- **Garden:** the set of soil tiles given by the plot positions.
- **Layout:** a list of placed crops, each with a crop type and a top-left tile. A placement is valid when its whole footprint is on garden tiles that no other crop uses. Tiles may be empty.
- **Moves** always produce a valid layout:
  - change the crop on a 1x1 tile, or swap two crops of the same size;
  - change a 2x2 or 3x3 crop to another crop of the same size;
  - place a 2x2 or 3x3 crop at a new position, removing the crops it overlaps and filling the freed tiles with 1x1 crops;
  - remove a 2x2 or 3x3 crop and fill its tiles with 1x1 crops;
  - slide a 2x2 or 3x3 crop by one tile, removing and refilling the same way.

### 5.2 Search method

- **Start:** a greedy layout. Place goal crops in importance order, large crops first, then fill the remaining tiles.
- **Improve:** Late Acceptance Hill Climbing (LAHC) with the moves from 5.1. LAHC only needs to answer "is layout A better than layout B", so it works directly with the level-by-level comparison in 4.3. No need to merge the levels into one number.
- **Scoring:** recompute the whole layout after each move (at most 81 tiles with 4 neighbors each). This is fast enough for hundreds of thousands of layouts per second; add incremental scoring only if benchmarks need it.
- **Restarts:** several runs with different random seeds, keeping the best. The random number generator is seeded so any result can be reproduced.
- **Responsiveness:** runs in Web Workers (one per CPU core). The page shows the best layout found so far and has a Stop button.
- **Locks:** moves never change locked plants or locked plots.

### 5.3 Choosing the plot arrangement

Crops cross plot borders, so the arrangement sets the shape of one tile field. The shape changes how many large crops fit and how many crops can reach their buff counts. A brute-force check tried every possible placement on every arrangement of 9 plots, using the rules in section 3 (script: `research/arrangement_bruteforce.py`). In the two buff columns, every tile not used by the large crop holds Wheat, which gives Harvest Boost.

| 9 plots arranged as | Most Blueberries | Most Blueberries that all get Harvest Boost | Most Apples that all get Harvest Boost |
|---|---|---|---|
| 3x3 block (9x9 tiles) | 16 | **16** | 6 |
| Row of 5 plots next to a row of 4, aligned at one end | **19** | 15 | **7** |
| Best of all 1,285 arrangements | 19 | 16 | 7 |

The 3x3 block is best for one of these goals, and the row of 5 next to a row of 4 is best for the other two. The best arrangement depends on the goals, so the planner compares arrangements instead of assuming one.

- **Candidates:** every connected arrangement of N plots on a 3-tile grid, ignoring rotations and mirror images (1,285 for 9 plots, 35 for 6).
- **Size limit (optional):** the user can enter the space they have (for example 15x15 tiles), and arrangements that don't fit are skipped.
- **Screening:** score every candidate with a quick greedy layout, run short searches on the best few dozen, then long searches on the best 3. The exact counts are tuned in the benchmark (5.4). Candidates are not filtered by compactness. It is a useful hint but not a rule: the 3x3 block has the most shared plot edges and still loses two of the three examples above.
- **Result:** the best layout is the suggestion. The best layouts on other arrangements become the alternatives.
- **Draw my own:** the user places plots on a tile grid to match their yard, including gaps. Only that arrangement is searched.
- **Offset plots** (shifted by 1 or 2 tiles) are allowed in "Draw my own" but are not suggested at first. Add them to the candidates if tests show they can beat aligned arrangements.

### 5.4 Checking that the planner is good

- **Exhaustive tests:** for small cases (1 plot with 3 or 4 crops, 2 plots with 2 crops) try every possible layout to find the true best score. The planner must reach the same score.
- **Known optimums:** the brute-force results in 5.3 are regression tests. The planner must match them.
- **Property tests:** every result is valid, locked plants are unchanged, and only allowed crops are used.
- **Rule tests:** hand-checked layouts, ideally copied from in-game screenshots, with the buffs each plant should receive. Include the cases the existing planners test, for example that a plot of only Carrots gets no Weed Block.
- **Benchmark, one arrangement:** 9 plots, all 15 crops allowed, about 8 goals. Under 3 seconds on a laptop, and the same best score in at least 9 of 10 runs with different seeds.
- **Benchmark, arrangement suggestion:** 9 plots. First result on screen within 2 seconds, finished within 20 seconds. For a set of test goal lists, screening must pick the same best arrangement as a long search on every candidate.

## 6. Screens

```
Desktop layout (on a phone the two panels stack)
+-------------------------------+--------------------------------------+
| GARDEN                        | RESULT    [Best] [Alt 2] [Alt 3]     |
| Plots: 9                      |                                      |
| Arrangement: (o) Suggest best |   plot grid: crop on each tile,      |
|              ( ) Draw my own  |   buff dots on each plant            |
| Space limit: 15 x 15 (opt.)   |                                      |
| GOALS                  [+Add] | GOALS                                |
| Apple|Quantity|4     [Must]   | ok    Apple Quantity   4/4    Must   |
| Apple|Harvest |All   [High]   | warn  Apple Harvest    3/4    High   |
| Wheat|Quantity|Max   [Med]    | ...                                  |
|                               |                                      |
| HELPERS  Carrot Onion Corn    | SEEDS TO BUY                         |
|                               | Apple x4 ...     Total: N gold       |
| [ Plan my garden ]            | [Edit]  [Re-optimize unlocked]       |
+-------------------------------+--------------------------------------+
```

**Result grid**

- Thick lines between plots, thin lines between tiles. Crops can cross plot lines.
- Each plant shows its crop and small colored dots for the buffs it receives. A buff that a goal asked for but the plant lacks shows as a hollow dot.
- Tapping or hovering a plant shows which buffs it gets, which neighbors give each one, and which goals it counts toward. For 2x2 and 3x3 crops it shows the contact count, for example "Harvest Boost: 2 of 3 touching tiles".

**Goal summary:** each goal with its result (for example 3/4), its importance, and the reason for any shortfall.

**Alternatives:** tabs for switching the grid, plus a table with one row per goal and one column per alternative.

**Edit mode:** pick a crop from a palette and tap tiles to place it (valid spots are highlighted for 2x2 and 3x3 crops). Tap the lock icon on a plant or plot. "Re-optimize unlocked" runs the planner on everything else.

**Seed shopping list:** seeds per crop, price each, where to buy, and total gold.

## 7. Tech

- Vite + React + TypeScript in strict mode.
- Planner code lives in `src/engine/` as plain TypeScript with no UI imports, so it runs in Web Workers and in tests.
- Vitest for unit tests, fast-check for property tests.
- Hosted on GitHub Pages, deployed by GitHub Actions. No backend and no accounts.
- The current inputs autosave to the browser's localStorage so a page refresh doesn't lose them. (This is separate from the later Save and share feature.)
- Crop art: colored tiles with short labels at first. Check Palia's fan content policy before using game icons on a public site.

```
src/
  data/crops.json          crop data, game patch version, source links
  engine/
    types.ts
    rules.ts               receive counts by size, own-type rule, cross-border placement
    arrangement.ts         plot positions, tile adjacency, shape enumeration
    layout.ts              placed crops, placement checks, locks
    buffs.ts               buffs each plant receives
    score.ts               goal scores, level comparison, tie-breakers
    precheck.ts            capacity and missing-provider warnings
    search/
      greedy.ts
      moves.ts
      lahc.ts
      planner.ts           arrangement screening, restarts, alternatives
  worker/planner.worker.ts
  ui/                      GardenSetup, GoalList, HelperPicker, GardenGrid,
                           GoalSummary, Alternatives, ShoppingList, EditMode
```

## 8. Crop data

Sources: Palia wiki crop pages, cross-checked against open-source planner data (researched 2026-09-16). Stored in `src/data/crops.json` together with the game patch version and source links. The UI shows the data version so players can tell when it is out of date.

The first version needs only size, buff, seed price and source, and unlock requirement. Growth days, regrowth, yields and sell prices are stored too, for the later yield-based goals.

| Crop | Size | Buff it gives | Seed price and source | Unlock |
|---|---|---|---|---|
| Tomato | 1x1 | Water Retain | 80g, Zeki's | none |
| Potato | 1x1 | Water Retain | 40g, Zeki's | none |
| Napa Cabbage | 1x1 | Water Retain | 20g, Zeki's | none |
| Rice | 1x1 | Harvest Boost | 23g, Zeki's | none |
| Wheat | 1x1 | Harvest Boost | 25g, Zeki's | none |
| Corn | 1x1 | Harvest Boost | 30g, Zeki's | none |
| Carrot | 1x1 | Weed Block | 15g, Zeki's | none |
| Onion | 1x1 | Weed Block | 20g, Zeki's | none |
| Bok Choy | 1x1 | Weed Block | 30g, Zeki's | none |
| Cotton | 1x1 | Quality Boost | 40g, Zeki's | not confirmed |
| Blueberry | 2x2 | Harvest Boost | no gold price; Seed Collector or Guild Store | Gardening 8 |
| Batterfly Bean | 2x2 | Harvest Boost | no gold price; gathered in Elderwood or Seed Collector | Elderwood access |
| Spicy Pepper | 2x2 | Quality Boost | 170g, Zeki's | Gardening 6 |
| Rockhopper Pumpkin | 2x2 | Quality Boost | 350g, Daiya Crop Store; or Seed Collector | none found |
| Apple | 3x3 | Harvest Boost | 280 Gardening Medals, Guild Store; or Seed Collector | Gardening 10 |

Notes:

- **Growth Boost:** since a mid-2024 update no crop gives it (Blueberry and Apple used to). It only comes from fertilizer. The goal editor only offers buffs that some allowed crop gives, so Growth Boost stays hidden until fertilizer support exists.
- **Lettuce:** a limited-time reward crop that gives no buff. Left out.
- **Harvest Boost** adds 50% yield (2 to 3 for 1x1 crops, 16 to 24 for Apple). Quality Boost's star chance is not documented. Neither number affects plant-count goals.
- **Shopping list:** seeds without a gold price are listed with their source instead of a cost, and Apple shows its cost in Gardening Medals.
- **Unlock filter:** the user can enter their Gardening level to hide crops they can't plant yet.

## 9. Milestones

1. **Rules and data:** write `crops.json` and `rules.ts`, and add data checks to the tests.
2. **Engine:** arrangement, layout, buffs, scoring, and prechecks, with hand-checked unit tests.
3. **Planner:** greedy start, LAHC, locks, arrangement screening, and alternatives, plus exhaustive tests and the benchmark. At this point the planner can be run from a test script.
4. **UI:** setup, goals, helpers, running with progress, result grid, goal summary, alternatives, shopping list. At this point the web app works end to end.
5. **Editing:** manual placement, locks, re-optimize.
6. **Ship:** phone layout, GitHub Pages deploy, README with the rules and data sources.

## 10. Risks

| Risk | Mitigation |
|---|---|
| A game patch changes a rule in section 3 | Rule values kept in `rules.ts`; rule tests built from in-game screenshots |
| Game patches change crops or buffs | All game data in one file with the patch version shown in the UI |
| The search misses the best layout | Exhaustive tests on small cases, restarts, benchmark consistency check |
| "Higher importance takes all" surprises users | Shortfall explanations in the goal summary |
| Slow on phones | Time limit, progress display, Stop button, Web Workers |

## 11. Later (not in the first version)

- Save and share layouts (link or image).
- Export a layout as an aisen planner save code, so players can open it in the planner they already use.
- Yield-based goals: items per harvest or per day, using the growth, regrowth, and yield data already in `crops.json`.
- Fertilizer as a buff source. There are five kinds, one per buff, used up once per growth cycle. A fertilizer does nothing on a crop that already gets the same buff from its neighbors, so the planner would suggest fertilizer only for buffs that neighbors can't provide.
- Several saved gardens.
