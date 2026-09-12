[GenomeSpy Core API](../index.md) / ParamValue

# Type Alias: ParamValue

> **ParamValue** = `Scalar` \| `null` \| `undefined` \| `IntervalSelection`

Runtime value type covered by the default embed parameter API.

The default type covers scalar variable parameters and interval selections.
Object and array variable parameters are supported at runtime, but callers
should provide their own generic type when accessing them:

`const param = api.getParam<MyValue>("myParam")`

Current limitations:

- Parameters are addressed by name only. Independent same-name parameters
  throw an ambiguity error.
- Computed `expr` parameters are readable but cannot be written.
- Point selections are exposed through `ParamNamespace.getSelection()`;
  they are not writable through the generic parameter API.
- Projected selections are not supported.
