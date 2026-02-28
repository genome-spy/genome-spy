# Config Migration Plan

## 1. Rationale

GenomeSpy has rich local configurability (mark/axis/scale/view properties in specs), but no global default/theme layer equivalent to Vega-Lite's `config` model.

This plan adds that layer with three constraints:

- preserve current rendering behavior for existing specs
- adopt a Vega-Lite-like structure and defaulting logic so it is familiar to Vega-Lite users
- support GenomeSpy's hierarchical composition model (including imported, reusable track specs)

Compatibility target:

- not strict 100% Vega-Lite parity
- similar spec/config shape, naming, and precedence model where features overlap
- GenomeSpy-native semantics remain first-class parts of the same config model

Why this is worth doing:

- central place for project-level defaults
- reusable themes
- less duplication in specs
- predictable precedence model
- cleaner scale default logic (current ad hoc defaults can be replaced with explicit config policy)
- better authoring ergonomics for reusable, mostly self-contained track specifications

## 1.1 Status Snapshot (Updated 2026-02-28)

Overall status:

- core migration implemented end-to-end
- docs/examples/test scaffolding added
- default behavior preserved for existing specs by default config/theme layers

Phase status:

- ✅ Phase 1 complete (`9b3013a7`)
- ✅ Phase 2 complete (`cdd30bff`)
- ✅ Phase 3 complete (`ccd0a9e7`)
- ✅ Phase 4 complete (`54f6a403`)
- ✅ Phase 5 complete (`f2b07f12`)
- ✅ Phase 6 complete (`f343066c`)
- ✅ Phase 7 complete (`21bf5d75`)

Remaining work is now hardening/polish, not foundational migration:

- deterministic shared axis/scale conflict policy (replace order-dependent first-wins behavior)
- finish config-izing remaining locked/derived rules where still hardcoded by design
- broader regression coverage (full test suite + docs build + optional visual/snapshot coverage)
- status update:
  - ✅ deterministic merge ordering implemented (`59e7031d`)
  - ✅ style system follow-up for mark/axis + style precedence tests/docs (`4634ea25`, `13a7976f`)
  - ✅ scale policy split clarified (configurable clamp/reverse/zoom baselines + invariant positional unit ranges) with tests/docs (`74168e9b`, `13a7976f`)
  - ✅ config-driven axis grid creation now respects bucket defaults during grid view creation (`572bddc8`)
  - ✅ side-by-side GenomeSpy vs Vega-Lite-like bar theme example added (`572bddc8`)
  - ✅ full `npm test` executed green (170 files, 980 passed) on 2026-02-28
  - ⚠️ `npm run build:docs` prepare step passes, but final `mkdocs build` is blocked in this environment (`mkdocs: command not found`)

## 2. Historical Baseline (Before Migration)

### 2.1 Top-level spec surface

Current `RootConfig` includes:

- `$schema`
- `genome`
- `baseUrl`
- `background`
- `datasets`

At baseline, there was no top-level `config` object.

GenomeSpy composition model already supports:

- deep nested view hierarchies
- importing specs/templates into the hierarchy
- partially self-contained reusable tracks

At baseline, there was no inherited config scope model across that hierarchy.

### 2.2 Runtime defaulting model today

Defaults are currently distributed as hardcoded constants/objects in runtime modules:

- mark defaults:
  - base defaults in `packages/core/src/marks/mark.js`
  - per-mark defaults in `point.js`, `rect.js`, `rule.js`, `text.js`, `link.js`
- axis defaults:
  - `defaultAxisProps` and `defaultGenomeAxisProps` in `packages/core/src/view/axisView.js`
- scale defaults:
  - `packages/core/src/config/scaleDefaults.js`
  - `packages/core/src/scales/scaleRules.js`
  - `packages/core/src/scales/scalePropsResolver.js`
- title defaults:
  - `BASE_TITLE_STYLE`, `TRACK_TITLE_STYLE`, `OVERLAY_TITLE_STYLE` in `packages/core/src/view/title.js`

### 2.3 Effective precedence today (important for migration)

#### Marks

1. explicit mark spec properties (e.g. `spec.mark.color`)
2. hardcoded defaults in mark class

Notes:

- implemented via `coalesceProperties(...)` in `Mark` base class
- there is a TODO marker explicitly pointing to Vega-Lite config support

#### Axes (shared axis resolution)

1. explicit encoding axis props (`encoding.<channel>.axis`)
2. merged shared-axis props from members (order-dependent conflict handling)
3. hardcoded `defaultAxisProps` / `defaultGenomeAxisProps`
4. dynamic derived defaults (`getDefaultAngleAndAlign`)

Notes:

- conflicts in merged axis props use current first value and warn (`mergeObjects`)
- title is handled separately in `AxisResolution.getTitle()`

#### Scales

1. explicit scale props from channel defs, merged in resolution
2. default props from channel/type heuristics (`getDefaultScaleProperties`)
3. default scale type by channel + data type (`getDefaultScaleType`)
4. post-merge behavior adjustments:
  - reverse discrete `y` if unspecified
  - remove `scheme` if `range` is set
  - default `zoom=true` for `index`/`locus`
  - locked properties (`range=[0,1]` for positional non-ordinal, `clamp=true` for continuous opacity)

Notes:

- `domain` is resolved separately and includes explicit/configured/data-derived logic
- merge conflicts in shared scale props also use current first value and warn

#### Titles

1. explicit `title` spec values
2. style-specific hardcoded presets for `"track-title"` and `"overlay"`
3. base hardcoded title defaults

### 2.4 What is risky in current model

- defaults are fragmented and not discoverable from one place
- merge precedence across shared members is partially order-dependent
- many docs mention scale config defaults, but no global config object exists yet
- changing defaults requires editing multiple runtime modules

## 3. What Is Currently Configurable In GenomeSpy

Even without global config, the spec-level surface is broad:

- root-level:
  - `background`, `genome`, `datasets`, `baseUrl`
- view-level:
  - sizing (`width`, `height`, step sizing, viewport sizing)
  - visibility (`visible`)
  - layout (`padding`, concat spacing/separators)
  - background styling (`view`)
  - title
  - opacity / dynamic opacity
  - resolve rules for scale/axis
  - templates/imports
- unit mark-level:
  - mark type and mark props (including many rendering-specific knobs)
  - encoding channels
  - per-channel `axis` and `scale`
- scale-level:
  - domain/range/scheme/type and many derived options
  - zoom options for compatible scales
- axis-level:
  - standard axis properties
  - genome-specific chromosome axis properties
- params/selections/transforms

What is missing:

- global defaults and theme composition before local spec overrides
- style namespaces and typed config buckets analogous to Vega-Lite

## 4. Global Config + Theme Structure (Vega-Lite-Like, Hierarchical)

## 4.1 Public shape

Introduce optional config scopes:

- `RootSpec.config?: GenomeSpyConfig`
- `ViewSpecBase.config?: GenomeSpyConfig`
- optional `ImportSpec.config?: GenomeSpyConfig` override scope (applied at import site)

Initial `GenomeSpyConfig` domains:

- `view`
- `mark` + mark-type blocks (`point`, `rect`, `rule`, `text`, `link`)
- `axis` + axis specialization blocks (`axisX`, `axisY`, `axisTop`, `axisBottom`, `axisLeft`, `axisRight`, and type-specific blocks where useful)
- `scale`
- `range`
- `title`
- `style` (named reusable style groups)

## 4.2 Internal architecture (hybrid model)

Use one public config object, but keep defaults modular near owners:

- subsystem defaults:
  - `config/defaults/markDefaults.js`
  - `config/defaults/axisDefaults.js`
  - `config/defaults/scaleDefaults.js`
  - `config/defaults/titleDefaults.js`
  - `config/defaults/viewDefaults.js`
- central assembly:
  - `config/defaultConfig.js`
- resolver:
  - `config/resolveConfig.js`

This mirrors Vega-Lite's architectural pattern (modular defaults + assembled top-level default config).

## 4.3 Config layering proposal (hierarchy-aware)

Config layering has two parts.

Global/theme assembly:

1. `INTERNAL_DEFAULT_CONFIG` (exactly matches today's behavior)
2. optional built-in theme
3. optional user theme object (embed/app-level)
4. root `spec.config`

Hierarchical scope resolution:

- each view can introduce `view.spec.config`
- imported specs can introduce their own root-view config
- import site can optionally override using `ImportSpec.config`
- effective config at a view = deep merge from root scope to current scope, where nearest scope wins

Then local explicit spec properties remain highest precedence at use sites.

## 4.4 Hierarchical resolution rules (closest scope dominates)

For any view `V`, resolve config scopes in this order:

1. internal defaults
2. built-in theme
3. user theme
4. root spec config
5. ancestor view configs from root down to parent of `V`
6. import site config (if `V` is under an import with `ImportSpec.config`)
7. imported subtree root config (if present)
8. `V`'s own config

Result: nearest scope dominates.

Notes:

- imported specs remain reusable/self-contained because their own root config travels with them
- parent/app-level themes still apply unless explicitly overridden closer to leaves
- local explicit mark/axis/scale/title spec properties still override resolved config values

## 4.5 Precedence matrices to implement

### Mark precedence (target)

1. explicit mark definition (`mark.<prop>`)
2. mark local style(s) from resolved `config.style` (later style names win)
3. mark-type block from resolved config (`config.<markType>`)
4. generic mark block from resolved config (`config.mark`)
5. internal defaults

This intentionally mirrors the Vega-Lite model used by `getMarkConfig(...)`.

### Axis precedence (target)

1. explicit axis in encoding (`encoding.<channel>.axis.<prop>`)
2. axis explicit style(s)
3. axis specialization buckets from resolved config (type/channel/orient specific)
4. generic resolved `config.axis`
5. axis style referenced by axis config buckets
6. internal defaults

For shared axes, merge policy should be deterministic and documented (preferably not dependent on registration order).

### Scale precedence (target)

1. explicit channel scale (`encoding.<channel>.scale.<prop>`)
2. derived defaults from rules that depend on channel/type/mark context
3. resolved `config.scale` baseline defaults
4. resolved `config.range` / named range mapping defaults
5. internal defaults

## 4.6 Scale logic goal (explicit)

Keep logic similar to Vega-Lite while allowing GenomeSpy-specific default values:

- configurable default color scheme selection by data type:
  - nominal
  - ordinal
  - quantitative
  - temporal (where relevant)
  - plus GenomeSpy types (`index`, `locus`) when applicable
- configurable named ranges (`category`, `ordinal`, `ramp`, `heatmap`, `diverging`, etc. as supported)
- preserve existing default behavior initially by setting defaults to current values:
  - nominal -> `tableau10`
  - ordinal -> `blues`
  - quantitative -> `viridis`

## 5. GenomeSpy Semantics That Are Not 1:1 With Vega-Lite

These are native requirements for GenomeSpy:

- genomic scale types and behavior (`locus`, `index`)
- genome axis options (`chromTicks`, `chromLabels`, `chromGrid*`)
- multiscale view semantics and transition stops
- dynamic view opacity driven by zoom metrics
- resolve behaviors beyond shared/independent (`excluded`, `forced`)
- template/import and app visibility/addressability workflows
- GPU/runtime tuning props (e.g. `minBufferSize`, `minPickingSize`)

Implication:

- keep a familiar Vega-Lite-like model
- include GenomeSpy-native domains directly in first-class config types

## 6. Step-By-Step Migration Plan

### Phase 0: Baseline + Test Harness ✅

Scope:

- freeze existing behavior before wiring config

Deliverables:

- inventory of current hardcoded defaults (see Section 8)
- focused regression tests for marks, axes, scales, titles

Acceptance criteria:

- existing specs render unchanged
- `npm test` green with new baseline tests

Suggested tests:

- mark default property tests per mark type (with minimal unit specs)
- axis default rendering/property tests for non-locus and locus
- scale default resolution tests for channel+type matrix
- precedence conflict tests for shared scale/axis merges

### Phase 1: Schema + Config Resolver (No Behavioral Change) ✅

Scope:

- add `config` schema surface and internal resolver without consuming it yet

Deliverables:

- `GenomeSpyConfig` type and schema integration
- `config?: GenomeSpyConfig` added to `RootSpec`, `ViewSpecBase`, and `ImportSpec` (if import overrides are included)
- `INTERNAL_DEFAULT_CONFIG` matching current runtime defaults
- `resolveConfig(...)` that supports global layers and hierarchical scope inheritance
- resolved per-view effective config attached to runtime/view context

Acceptance criteria:

- with no `spec.config`, output is identical to current behavior
- hierarchical scope computation is deterministic
- with hierarchical configs present but consumers not yet migrated, rendering behavior stays unchanged

### Phase 2: Mark Defaults Migration ✅

Scope:

- migrate mark hardcoded defaults to config-driven reads

Deliverables:

- mark consumer helper, e.g. `getConfiguredMarkDefaults(markType, context)`
- default blocks mapped from current mark files

Acceptance criteria:

- default rendering unchanged when `spec.config` omitted
- overriding `config.mark` and `config.<markType>` affects defaults as expected
- explicit `mark` props still win

### Phase 3: Axis Defaults Migration ✅

Scope:

- migrate axis defaults and orient/type rules to config buckets

Deliverables:

- axis config buckets (`axis`, `axisX`, `axisY`, `axisTop`, ...)
- deterministic merge/precedence logic for shared axes
- genome-axis defaults moved into same config system

Acceptance criteria:

- existing axis look/behavior unchanged by default
- explicit axis props override config
- config buckets apply in documented order

### Phase 4: Scale Defaults Migration ✅

Scope:

- move current scale defaulting rules to explicit config + rule helpers

Deliverables:

- config-driven equivalents for:
  - default schemes by data type
  - default discrete ranges (shape, angle, size, etc.)
  - `nice`, `zero`, `clamp`, and zoom defaults
- clear policy separation:
  - baseline values from config
  - context-dependent derived logic from rule helpers

Acceptance criteria:

- existing behavior unchanged with default config
- scheme defaults configurable by type bucket (`nominal`, `ordinal`, `quantitative`, ...)
- no regressions in `scaleRules`, `scaleResolution`, and legacy `scale/scale.test.js` behaviors

### Phase 5: Title + View Defaults Migration ✅

Scope:

- move title preset and view background defaults into config

Deliverables:

- `config.title` defaults
- style mapping for title variants currently hardcoded (`track-title`, `overlay`)
- `config.view` defaults where applicable

Acceptance criteria:

- title placement/style unchanged under default config
- title styles can be globally themed without changing spec-local title text

### Phase 6: Themes ✅

Scope:

- support reusable theme objects

Deliverables:

- embed/app API input for theme config
- merge order: internal defaults -> built-in theme -> user theme -> spec config
- one built-in "current behavior" theme

Acceptance criteria:

- theme switching modifies defaults only, never local explicit values
- no behavior delta for users not opting into themes

### Phase 7: Documentation + Cleanup ✅

Scope:

- finalize docs and remove obsolete hardcoded fallback code

Deliverables:

- docs page for global config
- precedence documentation with examples
- migration notes and compatibility expectations
- example specs in `packages/core/examples/` covering:
  - top-level config only
  - per-view scoped config override
  - imported track with self-contained config
  - import-site config override of imported track defaults

Acceptance criteria:

- docs reflect implemented behavior and precedence
- docs explicitly cover hierarchical config inheritance and import semantics
- obsolete default constants removed or reduced to config assembly modules

### 6.1 Phase-by-phase test checklist

Minimum automated tests to add during migration:

- ✅ `config/resolveConfig.test.js`
- ✅ `marks/markConfigPrecedence.test.js`
- ✅ `view/axisConfigPrecedence.test.js`
- ✅ `scales/scaleConfigDefaults.test.js`
- ✅ `scales/scaleSchemeSelection.test.js`
- ✅ `config/hierarchicalConfigResolution.test.js`
- ✅ `config/importConfigPrecedence.test.js`
- integration snapshots for representative specs:
  - basic scatter
  - layered track with shared axes
  - locus axis track
  - multiscale view
  - imported track with local config + parent override
  - status: not yet implemented as dedicated snapshot set

## 7. After Config Lands: Straightforward Configurability Upgrades

Priority set after core migration is stable:

1. Scale config cleanup:
   - expose configurable per-type default color schemes
   - expose named range mapping policy (category/ordinal/ramp/heatmap/diverging)
   - expose `continuousPadding`, `bandPaddingInner`, `bandPaddingOuter`, `pointPadding`
   - centralize `nice`, `zero`, `clamp` policy in `config.scale`
2. Axis theming:
   - typography/color/stroke defaults by channel/orient/type
3. Mark theming:
   - coherent global defaults across mark types (color/opacity/stroke conventions)
4. Title/style system:
   - reusable named styles instead of hardcoded title variants
5. App integration:
   - map core config theme tokens to app visual tokens where practical
6. Genome-specific theme knobs:
   - chromosome axis styling families
   - locus/index scale interaction defaults

## 8. Hardcoded Defaults Inventory (Current -> Target Config Keys)

This inventory is the migration backbone for Phases 1-5.

## 8.1 Mark base defaults (`marks/mark.js`)

- `clip` (dynamic getter based on zoomable positional scales) -> `config.mark.clip` policy hook
- `xOffset = 0`, `yOffset = 0` -> `config.mark.xOffset`, `config.mark.yOffset`
- `minBufferSize = 0` -> `config.mark.minBufferSize` (likely internal/advanced)

## 8.2 Point defaults (`marks/point.js`)

- `x=0.5`, `y=0.5`, `color="#4c78a8"`, `filled=true`, `opacity=1`, `size=100`
- `shape="circle"`, `strokeWidth=2`, `dx=0`, `dy=0`, `angle=0`
- semantic/picking props (`semanticZoomFraction`, `minPickingSize`, etc.)
- target keys:
  - `config.point.*` (plus fallback `config.mark.*`)

## 8.3 Rect defaults (`marks/rect.js`)

- `filled=true`, `color="#4c78a8"`, `opacity=1`, `strokeWidth=3`
- `cornerRadius=0`, `minWidth=0.5`, `minHeight=0.5`, `minOpacity=1`
- target keys:
  - `config.rect.*` (plus fallback `config.mark.*`)

## 8.4 Rule defaults (`marks/rule.js`)

- `size=1`, `color="black"`, `opacity=1`
- `minLength=0`, `strokeDash=null`, `strokeDashOffset=0`, `strokeCap="butt"`
- target keys:
  - `config.rule.*` (plus fallback `config.mark.*`)

## 8.5 Text defaults (`marks/text.js`)

- `x=0.5`, `y=0.5`, `text=""`, `size=11`, `color="black"`, `opacity=1`
- `align="center"`, `baseline="middle"`, `dx=0`, `dy=0`, `angle=0`
- fit/squeeze/flush/logo/viewport-edge-fade defaults
- target keys:
  - `config.text.*` (plus fallback `config.mark.*`)
  - title-related text defaults should also align with `config.title`/style

## 8.6 Link defaults (`marks/link.js`)

- `x=0`, `y=0`, `size=1`, `color="black"`, `opacity=1`
- link-shape and arc tuning defaults (`segments`, `arcHeightFactor`, etc.)
- target keys:
  - `config.link.*` (plus fallback `config.mark.*`)

## 8.7 Axis defaults (`view/axisView.js`)

- generic axis defaults (`domain*`, `tick*`, `label*`, `title*`, extents)
- genome axis defaults (`chromTicks*`, `chromLabels*`)
- derived label angle/alignment fallback logic
- target keys:
  - `config.axis.*`
  - specialized buckets (`config.axisX`, `config.axisY`, etc.)
  - genome-specific axis config in same family (no separate secondary namespace)

## 8.8 Scale defaults (`config/scaleDefaults.js`, `scales/scaleRules.js`)

- current scheme defaults by data type:
  - nominal -> `tableau10`
  - ordinal -> `blues`
  - other/color -> `viridis`
- discrete channel ranges:
  - shape symbols
  - size range `[0,400]`
  - angle range `[0,360]`
- locked behavior:
  - positional non-ordinal -> `range=[0,1]`
  - continuous opacity -> `clamp=true`
- target keys:
  - `config.scale` + `config.range`
  - explicit per-type scheme selection policy

## 8.9 Title defaults (`view/title.js`)

- base title defaults (`anchor`, `frame`, `offset`, `orient`, typography)
- style presets (`track-title`, `overlay`)
- target keys:
  - `config.title.*`
  - `config.style.group-title` and style aliases

## 9. Vega-Lite Overlap Compatibility Matrix

This is the intended compatibility posture for overlapping domains.

| Domain | Vega-Lite Pattern | GenomeSpy Target |
| --- | --- | --- |
| Top-level config | `spec.config` merged with defaults | Same structure |
| Mark defaults | `config.mark` + `config.<markType>` + `config.style` | Same precedence shape |
| Axis defaults | `config.axis*` specialization buckets | Similar bucket model; includes genome axis knobs |
| Scale defaults | `config.scale` + `config.range` + derived rules | Similar logic, GenomeSpy defaults |
| Title defaults | `config.title` + styles | Similar model |
| Theme merge | default -> provided config -> spec config | Same conceptual layering |
| Hierarchical config scopes | mostly top-level in common usage | Native per-view and import-aware scope inheritance, closest scope wins |
| Legends/headers/projection | full Vega-Lite domains | Defer unless/until corresponding GenomeSpy feature surfaces exist |

## 10. Detailed Next Steps (Post-Migration Hardening)

### 10.1 Deterministic Shared Merge Policy (Highest Priority)

Problem:

- shared axis/scale conflicts still rely on `mergeObjects(...)` behavior that is effectively registration-order dependent

Why it matters:

- config hierarchy and themes become less predictable if sibling registration order can affect merged shared output

Implementation tasks:

1. define explicit conflict policy for shared axis and scale members
2. implement that policy in shared resolution merge points (`AxisResolution`, scale prop merge path)
3. document conflict semantics in docs/grammar/config.md
4. add focused tests for conflicting sibling overrides in shared resolutions

Acceptance criteria:

- same spec yields same merged axis/scale props independent of member registration order
- warning/error behavior is deterministic and documented

### 10.2 Remaining Scale Policy Cleanup ✅

Problem:

- some defaults are now config-driven, but a few locked/derived behaviors are still partly hardcoded by rule helpers

Implementation tasks:

1. review `scaleRules` and `scalePropsResolver` for remaining hardcoded policies
2. decide which should stay hardcoded invariants and which should be configurable
3. add config keys for accepted candidates (for example clamp policy where appropriate)
4. ensure no behavior change for existing specs under default config

Acceptance criteria:

- policy split is explicit: invariant vs configurable
- config docs reflect actual behavior

### 10.3 Style System Follow-up ✅

Problem:

- current migration supports `config.style` for title usage, but mark/axis style parity with Vega-Lite-like style application is not fully implemented

Implementation tasks:

1. decide style precedence for mark/axis explicit style names
2. implement style lookup and precedence across config scopes
3. add tests for style overrides and nearest-scope behavior
4. document style semantics and examples

Acceptance criteria:

- style behavior is coherent across title/mark/axis
- explicit local properties still override style/config defaults

### 10.4 Broader Regression Coverage 🔄

Implementation tasks:

1. add snapshot/integration coverage listed in Section 6.1
2. run full `npm test` once migration branch is stabilized
3. run `npm run build:docs` and validate schema macro output

Acceptance criteria:

- full suite green
- docs build green
- integration snapshots establish baseline for future refactors

Current progress:

- ✅ full suite green (`npm test`)
- ✅ config-related example/layout snapshots already in `packages/core/examples/layout.test.js`
- ⏳ docs build pending local `mkdocs` availability

### 10.5 App-Level Theme Integration (Optional but Valuable)

Implementation tasks:

1. review whether App should pass a default theme into core embed
2. map app visual tokens to core theme config where useful
3. verify no behavior change unless opt-in

Acceptance criteria:

- app-level theming path is clear and tested
- no regressions in current app visuals by default

## 11. Examples And Documentation Workstream

Examples location:

- all new config examples should be added under `packages/core/examples/`

Status:

- ✅ implemented (`packages/core/examples/config/` and docs/grammar/config.md)

Recommended example set:

- `config-basic.json`: root-level config only
- `config-scoped-view.json`: child-view override of parent defaults
- `config-imported-track.json`: imported reusable track with self-contained config
- `config-import-override.json`: import-site override of imported track defaults
- `config-scale-schemes-by-type.json`: configurable nominal/ordinal/quantitative defaults

Documentation expansion:

- add a new docs page for global/hierarchical config semantics in `docs/grammar/`
- update existing grammar pages (`mark`, `scale`, `composition/import`) with:
  - config scope inheritance rules
  - precedence matrices
  - scale default scheme selection by data type
  - import-related config behavior
- include a migration subsection showing how to replace repetitive local mark/axis/scale settings with scoped config

Documentation acceptance criteria:

- users can determine effective config for any view using one documented precedence algorithm
- docs include at least one full composed/imported example showing nearest-scope dominance
- docs and examples stay aligned with implemented behavior in tests

## 12. Implementation Workflow Requirements

When executing this plan:

- run TypeScript checks before every commit:
  - `npm -ws run test:tsc --if-present`
- commit after each completed phase (do not batch multiple phases into one commit)
- after each commit, re-read `CONFIG_PLAN.md` before starting the next phase
- if `test:tsc` fails, fix issues before committing

## 13. Theme Profiles And Subtree Theme Selection (Next)

Goal:

- support multiple reusable theme configs in the same spec
- allow choosing a theme per view subtree (including imported track roots)
- keep behavior unchanged when no theme is selected

### 13.1 Proposed Spec Model

Add two optional properties to every config scope (`RootSpec.config`, `ViewSpecBase.config`, `ImportSpec.config`):

- `themes?: Record<string, GenomeSpyConfig>`
- `theme?: string | string[]`

Semantics:

- `themes` defines named theme profiles local to that scope
- `theme` selects one or more named profiles to apply at that scope
- later names in `theme: [...]` override earlier names
- explicit config keys in the same scope override selected theme profile values

Also keep built-in named themes available globally:

- `genomespy` (current behavior baseline)
- `vegalite` (best-effort Vega-Lite-like defaults for overlapping domains)

### 13.2 Resolution Algorithm (Static, Hierarchical)

For each view scope from root to leaf:

1. inherit parent effective config
2. extend inherited theme registry with local `themes`
3. apply selected local `theme` profiles (resolved from current registry + built-ins)
4. apply local explicit config keys (excluding `themes` and `theme`)

Then normal local explicit mark/axis/scale/title properties still win at usage sites.

Notes:

- this remains static (resolved during initialization / rebuild), not live-reactive
- no special “extension” namespace for GenomeSpy-specific settings

### 13.3 Why This Fits GenomeSpy

- matches track-composition workflow: each imported or nested track can pick a suitable baseline
- allows local visual identity without copying large config blocks
- keeps closest-scope-dominates behavior already used by config hierarchy

### 13.4 Implementation Plan

Phase A: Schema + Types

1. add `theme` and `themes` to `GenomeSpyConfig` typings/schema
2. document that theme profile values are plain `GenomeSpyConfig` fragments
3. keep backward compatibility: both fields optional

Phase B: Config Resolver

1. extend config resolution to carry both:
   - effective config object
   - effective theme registry map
2. apply selected profiles before explicit local keys in each scope
3. throw clear errors for unknown theme names (`theme: "foo"` not found)

Phase C: Import + Hierarchy Semantics

1. ensure `ImportSpec.config.theme` and `ImportSpec.config.themes` participate in existing precedence
2. verify imported root config can still override import-site choices when intended
3. add deterministic tests for collision cases (same theme name in ancestor/descendant scopes)

Phase D: Built-ins

1. add a built-in theme catalog module (e.g. `themes/genomespy`, `themes/vegalite`)
2. keep `genomespy` effectively no-op over internal defaults
3. implement `vegalite` with overlap-only defaults (axis/grid/view stroke/colors/schemes)

Phase E: Tests + Examples + Docs

1. tests for:
   - theme profile selection order (`["a", "b"]`)
   - nearest-scope theme registry shadowing
   - unknown theme errors
   - import-site vs imported-root behavior
2. examples:
   - one spec defining multiple theme profiles and applying them per subtree
   - one import-based track composition example using subtree theme selection
3. docs:
   - add `themes`/`theme` spec reference
   - include precedence matrix with profile selection step

### 13.5 Feasibility Assessment

Feasibility: **high**.

Why:

- existing hierarchical config infrastructure already exists and is deterministic
- theme layering already exists at embed/base level
- remaining work is mostly schema + resolver extension + tests/docs

Estimated complexity:

- medium (resolver/state plumbing + clear precedence docs/tests)
- low-to-medium runtime risk when implemented incrementally

### 13.6 Risk Analysis

1. Shared resolution conflicts across differently themed siblings
- Risk: shared axis/scale may still force a single merged outcome
- Mitigation: document and test; recommend `resolve: independent` for mixed-theme sibling tracks

2. Theme name collisions across scopes
- Risk: ambiguous mental model when descendant redefines ancestor theme name
- Mitigation: explicit nearest-scope shadowing rule + tests + warning docs examples

3. Unknown or mistyped theme names
- Risk: silent fallback could hide mistakes
- Mitigation: fail fast with clear error listing available names

4. Recursive / cyclic profile references (if ever allowed)
- Risk: infinite recursion or hard-to-debug merge chains
- Mitigation: initially disallow nested `theme` selection inside theme profile objects; keep theme profiles as plain config fragments only

5. Resolver complexity and performance
- Risk: repeated deep merges with large hierarchies
- Mitigation: cache resolved scope outputs per view during initialization and reuse existing merged config objects

6. Vega-Lite parity expectations
- Risk: users expect full parity from `vegalite`
- Mitigation: document “best effort for overlapping features” and keep GenomeSpy-native defaults for non-overlap domains

---

Guiding principle: move hardcoded defaults into config in small slices, and prove unchanged rendering at each slice before moving on.
