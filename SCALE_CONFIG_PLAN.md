# View-Level Scale Config Plan

## Goal

Add a view-level way to configure scale resolutions, primarily to make shared
genomic navigation domains easier to declare in composed views.

The motivating case is genome-browser-like specifications where the visible
domain is a property of a subtree, not of an arbitrary child mark. The current
channel-level `encoding.x.scale.domain` syntax remains valid, but it can be
awkward when the scale is shared across several tracks.

View-level `scales` should be an alternative scale-configuration mode for a
resolution, not an additional merge layer on top of buried channel-level scale
objects.

## Proposed Spec Shape

Add an optional `scales` property to view specs:

```json
{
  "resolve": {
    "scale": {
      "x": "shared"
    }
  },
  "scales": {
    "x": {
      "domain": [
        { "chrom": "chr15", "pos": 92925000 },
        { "chrom": "chr15", "pos": 92949000 }
      ]
    }
  }
}
```

`resolve.scale.x` controls scale-resolution topology. `scales.x` configures the
scale resolution used by the view subtree when that resolution is unique.

## Semantics

- `scales.<channel>` applies to the scale resolution visible from the view
  subtree when the subtree has exactly one matching resolution for the channel.
- If the view directly owns the resolution, configure that resolution.
- If the view does not own the resolution, but all relevant descendants resolve
  to the same resolution, configure that shared resolution.
- If the subtree has multiple matching resolutions for the channel, fail as
  ambiguous and ask the user to move `scales.<channel>` closer to the intended
  subtree or set `resolve.scale.<channel>` explicitly.
- If the subtree has no matching resolution for the channel, keep the config as
  pending. This supports empty containers that will receive children
  dynamically.
- View-level scale config replaces member-level scale objects as the source of
  scale properties for the targeted resolution.
- Members still contribute extracted data domains unless `scales.<channel>`
  defines a full explicit `domain`.
- View-level `domain` should be treated as an explicit domain for
  `isDomainDefinedExplicitly()`, `zero`, `nice`, and domain-transition defaults.
- Member channel definitions still provide fields, accessors, data types, and
  domain extraction.
- Member `encoding.<channel>.type` continues to drive resolution data-type
  inference.
- If `scales.<channel>.type` is provided, it must be compatible with the
  inferred resolution data type.
- If a view-level `scales.<channel>` targets a resolution, no participating
  member in that resolution may define `encoding.<channel>.scale`.
- `forced` remains an advanced/internal topology mode. View-level scale config
  should not be documented as a normal authoring path.

## Design Constraints

- Keep `scales.<channel>` strict and single-target.
- Do not implement `scales.<channel>` as inherited defaults that fan out over
  multiple independent scale instances.
- Do not silently apply a view-level scale config to several descendant
  resolutions.
- Runtime validation may later become more mode-specific, so property handling
  should be centralized rather than scattered through callers.
- User-facing docs should describe only the current behavior and should not
  discuss future scale/domain-resolution plans.

## Exclusive Scale Config Mode

View-level `scales.<channel>` and member-level
`encoding.<channel>.scale` are mutually exclusive for the same resolution.

Reject any participating member scale object when a view-level scale config
targets the same resolution:

- `scales.x` plus `encoding.x.scale`
- `scales.x` plus `encoding.x2.scale`, when `x2` resolves to the same primary
  `x` resolution
- `scales.color` plus `encoding.color.scale`

The error should tell users to move all scale properties for the resolution to
`scales.<channel>` or remove the view-level config.

Reject conflicting view-level configs that target the same resolution from
different views. Identical repeated configs should also be rejected initially to
avoid creating a second source of truth.

Member channel definitions without `scale` remain valid and required. They
continue to determine the resolution data type and provide domain extraction.

## Type Inference

Current scale type inference should continue to work:

- Participating channel definitions determine the resolution data type.
- If `scales.<channel>.type` is omitted, the scale type is inferred from the
  channel and resolution data type.
- If `scales.<channel>.type` is provided, validate it against the inferred
  resolution data type.
- Shared resolutions still reject incompatible member data types.
- A pending config in an empty subtree has no inferred data type until matching
  members are added.

Examples:

```json
{
  "scales": {
    "x": { "domain": [0, 100] }
  },
  "layer": [
    {
      "mark": "point",
      "encoding": {
        "x": { "field": "pos", "type": "quantitative" }
      }
    }
  ]
}
```

The `x` scale type is inferred as `linear`.

```json
{
  "scales": {
    "x": {
      "type": "locus",
      "domain": [
        { "chrom": "chr1", "pos": 1 },
        { "chrom": "chr1", "pos": 1000000 }
      ]
    }
  },
  "layer": [
    {
      "encoding": {
        "x": { "chrom": "chrom", "pos": "start", "type": "locus" }
      }
    }
  ]
}
```

The explicit scale type is compatible with the member data type.

## Domain Semantics

View-level scale config should follow the existing scale-domain semantics:

- `scales.<channel>.domain` defines a full explicit domain and replaces
  extracted data domains for that resolution.
- `scales.<channel>.domainMin` overrides the lower bound while keeping the rest
  of the domain data-derived.
- `scales.<channel>.domainMax` overrides the upper bound while keeping the rest
  of the domain data-derived.
- `scales.<channel>.domainMid` inserts a midpoint into the resolved continuous
  domain.
- `nice`, `zero`, `padding`, and related scale properties apply to the resolved
  domain as they do for channel-level scale config.

Thus, this remains data-driven except for the lower bound:

```json
{
  "scales": {
    "y": {
      "domainMin": 0
    }
  },
  "layer": [
    {
      "encoding": {
        "y": { "field": "value", "type": "quantitative" }
      }
    }
  ]
}
```

The exclusivity rule prevents member-level scale objects, not member-level data
domain contribution.

## Empty and Dynamic Subtrees

An empty subtree may define `scales.<channel>` before any matching child exists.
The config stays pending until children create a matching resolution.

Dynamic mutations should remap pending and attached view-level scale configs:

- When a child is added, map pending configs in affected ancestor subtrees to a
  unique visible resolution when possible.
- When a child is removed, detach configs from removed resolutions and return
  them to pending if no matching resolution remains.
- If a mutation causes a config to target multiple matching resolutions, fail
  during mutation/initialization with an ambiguity error.
- If a mutation causes two view-level configs to target the same resolution,
  fail during mutation/initialization.

## Implementation Outline

1. Add a view-level `scales?: Partial<Record<ChannelWithScale, Scale>>` type to
   the spec definitions.
2. Resolve scale topology and member registration first, as today.
3. Add a post-registration pass that maps each view-level
   `scales.<channel>` entry to a unique visible resolution in that view's
   subtree.
4. Leave entries with no visible resolution pending.
5. Store mapped view-level configs on targeted `ScaleResolution` objects.
6. Reject participating member `encoding.<channel>.scale` objects when a
   resolution has a view-level config.
7. Extend scale-property resolution so view-level config replaces member scale
   config for targeted resolutions, while preserving member data-type inference.
8. Validate explicit `scales.<channel>.type` against the inferred resolution
   data type.
9. Extend domain planning so view-level `domain`, `domainMin`, `domainMax`, and
   `domainMid` are applied with the same semantics as current channel-level
   scale config.
10. Add validation for `scales.<channel>` entries that map to multiple visible
    resolutions.
11. Re-run view-level scale config mapping after dynamic child insertion and
    removal in container mutation helpers.
12. Update schema/docs artifacts after the TypeScript spec changes.
13. Refactor `examples/docs/genomic-data/examples/sashimi-plot.json` to use the
   new view-level domain.

## Tests

Add focused Vitest coverage near existing scale-resolution tests:

- A shared `vconcat` or `layer` can define `scales.x.domain` on the view that
  describes the subtree.
- An implicitly shared `vconcat` `x` scale can be configured from the `vconcat`
  view without explicit `resolve`.
- A nested view can define `scales.x.domain` when all relevant descendants share
  one `x` resolution, even if the actual resolution is pulled upward.
- Child tracks share the same resolution and receive the view-level domain.
- View-level expression domains update reactively.
- View-level `domainMin` combines with extracted data domains.
- View-level `domainMax` combines with extracted data domains.
- View-level `domainMid` applies to the resolved continuous domain.
- Defining `scales.x` in a subtree with multiple independent `x` resolutions
  fails clearly.
- Defining `scales.x` in an empty subtree stays pending and does not fail.
- Adding a child to an empty subtree with pending `scales.x` attaches the config
  to the newly visible unique resolution.
- Removing the last matching child detaches the config and returns it to pending.
- View-level `scales.x` plus participating `encoding.x.scale` fails clearly.
- View-level `scales.x.type` is validated against inferred member data type.
- View-level `scales.x` without `type` still uses existing implicit scale type
  inference.
- Two view-level configs targeting the same resolution fail clearly.
- `excluded` subtrees can define their own `scales.x.domain` without joining the
  parent resolution.
- Existing channel-level scale domains continue to work when no view-level
  domain is defined.

## Documentation

Document the feature in `docs/grammar/scale.md`. Place it near the top of the
page, after the introductory channel-level scale example and before
`## Vega-Lite scales`. This is where readers are choosing how to configure
scales, before the page moves into scale types.

Add a section such as `## View-level scale configuration`.

The section should explicitly explain the rationale:

- Vega-Lite-style channel-level scale config works well for simple unit specs.
- In composed GenomeSpy views, especially genome-browser-like multi-track views,
  a shared positional scale often represents the viewport of a whole subtree.
- Placing the domain in one arbitrary child encoding hides that viewport and
  makes later refactoring cumbersome.
- View-level `scales` lets the shared scale be configured where the composed
  view is defined.

Keep the wording focused on user-visible semantics:

- Use `resolve.scale` to choose sharing behavior.
- Use view-level `scales` to configure the scale resolution used by a view
  subtree.
- Do not mix view-level `scales.<channel>` with participating
  `encoding.<channel>.scale` objects for the same resolution.
- Keep `encoding.<channel>.type` on members. It still describes the encoded data
  and drives default scale type inference.
- Use channel-level `encoding.<channel>.scale` for the old/member-level scale
  configuration style when no view-level `scales.<channel>` targets that
  resolution.

Avoid emphasizing internal resolution ownership. Explain that if a subtree has
multiple independent scales for the same channel, `scales.<channel>` must be
placed closer to the intended subtree or the sharing must be made explicit with
`resolve.scale`.

Include a side-by-side comparison:

- Vega-Lite-style/member-level config:

```json
{
  "layer": [
    {
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "start",
          "type": "locus",
          "scale": {
            "domain": [
              { "chrom": "chr15", "pos": 92925000 },
              { "chrom": "chr15", "pos": 92949000 }
            ]
          }
        }
      }
    }
  ]
}
```

- View-level config:

```json
{
  "resolve": {
    "scale": {
      "x": "shared"
    }
  },
  "scales": {
    "x": {
      "domain": [
        { "chrom": "chr15", "pos": 92925000 },
        { "chrom": "chr15", "pos": 92949000 }
      ]
    }
  },
  "layer": [
    {
      "encoding": {
        "x": {
          "chrom": "chrom",
          "pos": "start",
          "type": "locus"
        }
      }
    }
  ]
}
```

After implementation, update `examples/docs/genomic-data/examples/sashimi-plot.json`
to use the new form and reference it from the scale docs if it remains concise
enough for the page.

## Example Migration Candidates

Update examples where a scale domain represents a view or subtree viewport
rather than a property of a single child encoding.

Primary candidates:

- `examples/docs/genomic-data/examples/sashimi-plot.json`: shared locus
  viewport for a multi-track genomic view.
- `examples/docs/grammar/data/lazy/indexed-fasta-sequence-track.json`: move the
  `x` locus viewport domain from `encoding.x.scale` to top-level `scales.x`.
- `examples/docs/grammar/data/lazy/bigbed-ccre-track.json`: move the `x` locus
  viewport domain from `encoding.x.scale` to top-level `scales.x`.
- `examples/docs/grammar/data/lazy/vcf-clinvar.json`: move the lazy variant
  layer's `x` locus viewport domain to `scales.x` on the layer that defines the
  lazy subtree.
- `examples/docs/grammar/data/lazy/gff3-gene-annotations.json`: move the `x`
  locus viewport domain to top-level `scales.x`; consider moving the `y` lane
  scale config as well only if it reads better after migration.
- `examples/docs/grammar/data/lazy/bam-read-alignments.json`: move the shared
  `x` locus viewport domain from the second `vconcat` child to `scales.x` on the
  `vconcat` view.
- `examples/docs/grammar/data/lazy/axis-ticks.json`: useful non-genomic example
  for top-level `scales.x` with `domain` and `zoom`.

Secondary candidates or likely non-goals:

- `examples/docs/grammar/data/lazy/bigwig-gc-content.json`: `y` scale domain
  is a local quantitative value range, not a genomic viewport. Migrate only if
  the docs need a simple non-positional example.
- Color/fill scale configs in lazy examples are local categorical mappings and
  should usually stay channel-level unless they become shared across a subtree.
- `examples/docs/grammar/data/lazy/axis-genome.json` has no buried scale config
  and is not a migration candidate.

## Open Questions

- Should view-level scale config accept all `Scale` properties immediately, or
  should the initial schema restrict it to domain-related properties?
- Should unsupported owner-level properties fail, warn, or be accepted for
  future compatibility?
- Should `scales` use `ChannelWithScale` only, or allow all `Channel` values and
  validate at runtime?
- Should docs expose `excluded` as a valid advanced use case for nested genomic
  browser panels?
- Should empty pending `scales.<channel>` configs be allowed only for containers,
  or for any view?

## Review Notes

The plan is feasible with the current scale-resolution architecture, but it is
not a local schema-only change. The main risk is lifecycle management: view-level
configs must be mapped after resolution members exist and remapped after dynamic
child mutations. That mapping should be centralized so initial view creation,
child insertion, and child removal use the same behavior.

The exclusive-mode rule is important. It keeps the feature explainable and
prevents `scales.<channel>` from becoming another merge layer over
`encoding.<channel>.scale`. Member encodings still participate in data access,
data-type inference, and domain extraction, so scale type inference can continue
to use the existing resolution data type.

The pending-config behavior is useful for dynamic applications, but it should be
tested separately from initial static specs. If implementation complexity grows,
the static initial mapping can land first only if pending config storage is
designed so dynamic remapping can be added without changing user-visible
semantics.

## Implementation Steps

1. Add the schema surface.

   - Add `scales?: Partial<Record<ChannelWithScale, Scale>>` to view specs.
   - Keep the JSDoc concise and user-facing.
   - Regenerate schema artifacts if the build requires it.
   - Tentative commit: `feat(core): add view-level scale config schema`

2. Add view-level config collection and mapping infrastructure.

   - Create a centralized helper that walks view subtrees, finds
     `spec.scales`, and maps each channel to zero, one, or many visible
     `ScaleResolution` objects.
   - Treat zero matches as pending.
   - Treat multiple matches as an ambiguity error.
   - Do not yet change scale-property resolution.
   - Tentative commit: `feat(core): map view-level scale configs to resolutions`

3. Store mapped configs on `ScaleResolution`.

   - Add an API for attaching, replacing, and clearing the view-level config for
     a resolution.
   - Track the source view/config so duplicate configs targeting the same
     resolution can fail clearly.
   - Invalidate merged scale props and configured domains when the attached
     config changes.
   - Tentative commit: `feat(core): attach view-level config to scale resolutions`

4. Enforce exclusive scale config mode.

   - Reject participating `encoding.<channel>.scale` objects when the resolution
     has a mapped view-level config.
   - Include secondary channels that resolve to the same primary resolution.
   - Keep member definitions without `scale` valid.
   - Tentative commit: `feat(core): reject mixed scale config modes`

5. Integrate view-level config into scale property resolution.

   - Use view-level config as the scale-property source for targeted
     resolutions.
   - Preserve member data-type inference and mark context.
   - Validate explicit `scales.<channel>.type` against the inferred resolution
     data type.
   - Tentative commit: `feat(core): resolve scale props from view-level config`

6. Integrate domain handling.

   - Apply view-level `domain`, `domainMin`, `domainMax`, and `domainMid` with
     existing channel-level semantics.
   - Ensure ExprRef-driven domains subscribe and invalidate correctly.
   - Preserve extracted data domains for `domainMin`, `domainMax`, and
     `domainMid`.
   - Tentative commit: `feat(core): support view-level scale domains`

7. Support dynamic subtree mutations.

   - Re-run mapping after `ContainerMutationHelper.addChildSpec()` and
     `removeChildAt()`.
   - Ensure removed resolutions detach configs and pending configs can attach
     when a matching child is added later.
   - Add focused mutation tests for empty containers and ambiguity after
     insertion.
   - Tentative commit: `feat(core): remap view-level scale configs after mutations`

8. Add documentation.

   - Add `## View-level scale configuration` to `docs/grammar/scale.md` after
     the introductory channel-level example.
   - Include rationale and side-by-side member-level vs view-level examples.
   - Do not mention future domain-only sharing plans.
   - Tentative commit: `docs(core): document view-level scale config`

9. Migrate examples.

   - Update `sashimi-plot.json` first.
   - Update selected lazy data examples listed above.
   - Keep local categorical color/fill scale configs channel-level unless the
     scale is genuinely shared by a subtree.
   - Follow `examples/README.md` formatting guidance.
   - Tentative commit: `docs(core): migrate shared viewport scale examples`

10. Verify and regenerate artifacts.

    - Run focused Vitest suites for scale resolution, domain handling, topology,
      and dynamic container mutation.
    - Run schema/docs generation if required by changed spec types.
    - Run docs build if example macros or schema output changed.
    - Tentative commit: `chore(core): update generated schema and docs artifacts`
