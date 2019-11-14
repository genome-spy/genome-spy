# Expressions

Expressions allow for defining predicates or computing new variables based on
existing data. The expression language is based on JavaScript, but provides
only a limited set of features, guaranteeing secure execution.

Expressions can be used with the [filter](transform/filter.md) and
[formula](transform/formula.md) transforms.

## Usage

All basic arithmetic operators are supported:

<!-- prettier-ignore -->
```javascript
(1 + 2) * 3 / 4
```

The current data row is provided as the `datum` object. Its properties (columns)
can be accessed by using the dot or bracket notation:

<!-- prettier-ignore -->
```javascript
datum.foo + 2
```

If the name of the property contains special characters such as "`.`", "`!`",
or "<code> </code>" (a space) the bracket notation must be used:

<!-- prettier-ignore -->
```javascript
datum['A very *special* name!'] > 100
```

## Conditional operators

Ternary operator:

<!-- prettier-ignore -->
```javascript
datum.foo < 5 ? 'small' : 'large'
```

And the equivalent `if` construct:

<!-- prettier-ignore -->
```javascript
if(datum.foo < 5, 'small', 'large')
```

## Provided constants and functions

Common mathematical functions are supported:

<!-- prettier-ignore -->
```javascript
(datum.u % 1e-8 > 5e-9 ? 1 : -1) *
  (sqrt(-log(max(1e-9, datum.u))) - 0.618) *
  1.618
```

The full list of built-in constants and functions are documented in
[vega-expression](https://github.com/vega/vega/tree/master/packages/vega-expression#provided-constants-and-functions).
