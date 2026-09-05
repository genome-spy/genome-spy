# Provisional policy and live integration obligations

Milestone 2 introduces `packages/core/src/scales/domainLifecycle.js` and its
colocated tests. It is deliberately not connected to live scales yet. The model
proves a policy shape; it does not fix readiness or reduce the live coordinator
until milestone 3 replaces the existing branches.

## State and input boundary

`createDomainState` takes explicit startup display and reset domains.
`planDomainUpdate` returns next state plus a domain-change flag, selection-sync
request, and transition action. All input arrays are immutable snapshots. There
are no view, collector, scale, parameter runtime, or animator dependencies.

Three phases represent the two independent concerns without combinatorial flags:

- `collecting`: initial reference collection remains open and partial initial
  domains may replace the display.
- `interacted`: reference collection remains open, but ordinary data may no
  longer replace a zoomable display.
- `ready`: initial collection is complete permanently. Ordinary zoomable domains
  are preserved even without prior navigation; other domains update normally.

The initial reference can finish collecting after interaction, then freezes.
Reset target and loaded data extent continue to follow source snapshots. This
intentionally differs from today's early-interaction snapshot workaround; see
[the behavior contract](behavior-contract.md#intentional-corrections-and-integration-decisions).

A source snapshot contains a candidate, reference domain, reset domain, data
extent, and explicit readiness. It represents the current resolved union, not
a single contributor. Empty arrays are valid and do not indicate pending data.
`undefined` candidate means there is no proposed display. A ready-empty viewport
uses that form; source-specific viewport history/query logic can remain outside
the model. Initial readiness requires all relevant active contributors, including
constant versus field contributions and auxiliary lookup inputs. Viewport
readiness additionally requires coverage of each requested positional interval.

Policy describes the resolved scale kind (`continuous`, structural `index`, or
`discrete`), zoomability, render state, animation preference, and selection link.
Index domains skip automatic lane animations but support explicit animated
navigation. Discrete domains cannot be navigated/reset. Scale validation handles
unsupported public combinations before the policy is called.

## Mapping real callers

| Existing caller                                        | Model update/input                                                             | Execution obligations                                                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerCollectorSubscriptions`                       | `data` with aggregate snapshot and relevant-input readiness                    | Readiness changes must trigger evaluation even if numeric domains do not change. Never infer readiness from collector values.                                                                           |
| Domain expression subscriptions                        | `configuration` with freshly evaluated normalized candidate                    | Keep owner scope and pending parameter declarations; expression domains default to immediate updates.                                                                                                   |
| `reconfigure`, member registration/disposal/visibility | `membership` and current resolved snapshot                                     | Membership is not an explicit authored-domain override. Preserve completed phase and interaction. Configuration changes need a deliberate reason instead of being inferred from every reconfigure call. |
| View-level scale property replacement/recreation       | `configuration` only for a changed authored domain; otherwise `membership`     | Range/property-only recreation retains the owner's display and lifecycle. Normalize properties before deciding the committed display.                                                                   |
| Selection subscription                                 | `selection` for external changes; `selection-sync` for owner-originated writes | Preserve source-specific `initial` bypass and interval normalization. When cleared, candidate is normal fallback; external clears remain authoritative even when numerically equal to the display.      |
| `ViewportDomainScheduler`                              | `viewport` after debounce/coverage evaluation                                  | Preserve the query algorithm and per-contributor interval checks. Pending/empty candidates do not overwrite the display.                                                                                |
| `zoom`, public/bookmark `zoomTo`                       | `navigate` with normalized target and explicit duration                        | Reuse scale-specific pan/zoom math and public-to-internal conversion. Zero-duration navigation cancels transitions. Public validation precedes model updates.                                           |
| `resetZoom`                                            | `reset`                                                                        | Use the explicit reset target, not the initial reference. Reset during initial collection protects the display like navigation; verify this intended rule in integration.                               |
| Animator callbacks                                     | `frame`/`finish` with transition ID                                            | Commit each effective frame. Ignore stale IDs; completion cannot overwrite a newer domain.                                                                                                              |
| Separator views' direct scale-domain writes            | `configuration`                                                                | Keep layout-owned pixel domain updates explicit; physical setters must not bypass the future owner.                                                                                                     |

## Commit and notification boundary

The future owner installs next state before any effect. If `domainChanged`, it
mirrors the visible domain into the physical scale and emits the existing domain
event, with selection synchronization ordered before dependent notifications.
The scale setter must not also emit a duplicate event. Existing expression
propagation must settle before rendering; the model adds no scheduler.

`syncSelection` requests normalization and equality comparison before writing
the targeted selection interval. Preserve other selection channels and the
current fallback-to-null behavior. This request may occur even without a changed
display, because a linked initial domain may already match a physical startup
domain but still need to seed its parameter. Equal parameter values are not
republished. Selection echoes of committed animation frames carry explicit
`selection-sync` provenance and preserve the active transition when unchanged.
The owner must carry that provenance through parameter propagation; it must not
guess origin from domain equality. External clears or configuration updates can
cancel navigation even when equal to the display before its first frame.
Passive data and membership refreshes that retain the displayed selection
interval also preserve a running linked zoom, including bookmark navigation.

Transition action `start` replaces/cancels any previous animation and begins at
the current displayed domain. `cancel` stops the active animation; `none` leaves
it alone. The owner uses the existing animator/interpolation mathematics and
submits frames carrying the returned ID. Disposal cancels scheduled callbacks
and subscriptions. An unchanged target does not restart a running transition.

Readiness, reference, and extent changes can occur without a domain event. The
future owner must expose their progress to actual readiness/extent consumers
instead of emitting a fictitious domain change to wake lazy loading. Startup
lazy requests remain explicit, as in the existing source initialization path.

## Integration review requirements

Milestone 3 must demonstrate a single live domain writer and delete the replaced
snapshot, restore, and manual notification branches. Retaining both policies
indefinitely is not an acceptable integration. The model's phase, transition
identity, and domain values must become authoritative; adapters only provide
facts/normalized candidates and execute the decided actions.

Regression gates include side-input coverage with empty results, changed reset
or extent after early interaction, unchanged initialized zoomable domains,
expression updates with animation disabled, linked animation feedback,
membership during transitions, ordinal index stability, same-scale range
expressions, bookmark restoration, and domain-triggered layout invalidation.
Keep `scaleResolution.parameterDependency.test.js` as the real frame propagation
oracle. Browser verification is required when the live paths change.
