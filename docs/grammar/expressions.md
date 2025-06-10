# Expressions

Expressions allow for defining predicates or computing new variables based on
existing data. The expression language is based on JavaScript, but provides only
a limited set of features, guaranteeing secure execution.

Expressions can be used with the [`"filter"`](transform/filter.md) and
[`"formula"`](transform/formula.md) transforms, in
[encoding](./mark/index.md#expression), and in expression
references for dynamic properties in marks, transforms, and data
sources.

## Usage

All basic arithmetic operators are supported:

<!-- prettier-ignore -->
```javascript
(1 + 2) * 3 / 4
```

When using expressions within the data [transformation](./transform/index.md)
pipeline, the current data object is available in the `datum` variable. Its
properties (fields) can be accessed by using the dot or bracket notation:

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

[Ternary](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Conditional_Operator) operator:

<!-- prettier-ignore -->
```javascript
datum.foo < 5 ? 'small' : 'large'
```

And an equivalent `if` construct:

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

### Constants and functions from Vega

The following constants and functions are provided by the
[vega-expression](https://github.com/vega/vega/tree/master/packages/vega-expression#provided-constants-and-functions)
package.

#### Constants

[`NaN`](https://vega.github.io/vega/docs/expressions/#NaN),
[`E`](https://vega.github.io/vega/docs/expressions/#E),
[`LN2`](https://vega.github.io/vega/docs/expressions/#LN2),
[`LN10`](https://vega.github.io/vega/docs/expressions/#LN10),
[`LOG2E`](https://vega.github.io/vega/docs/expressions/#LOG2E),
[`LOG10E`](https://vega.github.io/vega/docs/expressions/#LOG10E),
[`PI`](https://vega.github.io/vega/docs/expressions/#PI),
[`SQRT1_2`](https://vega.github.io/vega/docs/expressions/#SQRT1_2),
[`SQRT2`](https://vega.github.io/vega/docs/expressions/#SQRT2),
[`MIN_VALUE`](https://vega.github.io/vega/docs/expressions/#MIN_VALUE),
[`MAX_VALUE`](https://vega.github.io/vega/docs/expressions/#MAX_VALUE)

#### Type Checking Functions

[`isArray`](https://vega.github.io/vega/docs/expressions/#isArray),
[`isBoolean`](https://vega.github.io/vega/docs/expressions/#isBoolean),
[`isNumber`](https://vega.github.io/vega/docs/expressions/#isNumber),
[`isObject`](https://vega.github.io/vega/docs/expressions/#isObject),
[`isRegExp`](https://vega.github.io/vega/docs/expressions/#isRegExp),
[`isString`](https://vega.github.io/vega/docs/expressions/#isString)

#### Math Functions

[`isNaN`](https://vega.github.io/vega/docs/expressions/#isNaN),
[`isFinite`](https://vega.github.io/vega/docs/expressions/#isFinite),
[`abs`](https://vega.github.io/vega/docs/expressions/#abs),
[`acos`](https://vega.github.io/vega/docs/expressions/#acos),
[`asin`](https://vega.github.io/vega/docs/expressions/#asin),
[`atan`](https://vega.github.io/vega/docs/expressions/#atan),
[`atan2`](https://vega.github.io/vega/docs/expressions/#atan2),
[`ceil`](https://vega.github.io/vega/docs/expressions/#ceil),
[`cos`](https://vega.github.io/vega/docs/expressions/#cos),
[`exp`](https://vega.github.io/vega/docs/expressions/#exp),
[`floor`](https://vega.github.io/vega/docs/expressions/#floor),
[`hypot`](https://vega.github.io/vega/docs/expressions/#hypot),
[`log`](https://vega.github.io/vega/docs/expressions/#log),
[`max`](https://vega.github.io/vega/docs/expressions/#max),
[`min`](https://vega.github.io/vega/docs/expressions/#min),
[`pow`](https://vega.github.io/vega/docs/expressions/#pow),
[`random`](https://vega.github.io/vega/docs/expressions/#random),
[`round`](https://vega.github.io/vega/docs/expressions/#round),
[`sin`](https://vega.github.io/vega/docs/expressions/#sin),
[`sqrt`](https://vega.github.io/vega/docs/expressions/#sqrt),
[`tan`](https://vega.github.io/vega/docs/expressions/#tan),
[`clamp`](https://vega.github.io/vega/docs/expressions/#clamp)

#### Sequence (Array or String) Functions

[`length`](https://vega.github.io/vega/docs/expressions/#length),
[`join`](https://vega.github.io/vega/docs/expressions/#join),
[`indexof`](https://vega.github.io/vega/docs/expressions/#indexof),
[`lastindexof`](https://vega.github.io/vega/docs/expressions/#lastindexof),
[`reverse`](https://vega.github.io/vega/docs/expressions/#reverse),
[`slice`](https://vega.github.io/vega/docs/expressions/#slice)

#### String Functions

[`parseFloat`](https://vega.github.io/vega/docs/expressions/#parseFloat),
[`parseInt`](https://vega.github.io/vega/docs/expressions/#parseInt),
[`upper`](https://vega.github.io/vega/docs/expressions/#upper),
[`lower`](https://vega.github.io/vega/docs/expressions/#lower),
[`replace`](https://vega.github.io/vega/docs/expressions/#replace),
[`split`](https://vega.github.io/vega/docs/expressions/#split),
[`substring`](https://vega.github.io/vega/docs/expressions/#substring),
[`trim`](https://vega.github.io/vega/docs/expressions/#trim)

#### Formatting Functions

[`format`](https://vega.github.io/vega/docs/expressions/#format)

#### RegExp Functions

[`regexp`](https://vega.github.io/vega/docs/expressions/#regexp),
[`test`](https://vega.github.io/vega/docs/expressions/#test)

### Other functions

<a name="lerp" href="#lerp">#</a>
<b>lerp</b>(<i>array</i>, <i>fraction</i>)<br/>
Provides a linearly interpolated value from the first to the last element in the given _array_ based on the specified interpolation _fraction_, usually ranging from 0 to 1. For instance, lerp([0, 50], 0.5) yields 25.

<a name="linearstep" href="#linearstep">#</a>
<b>linearstep</b>(<i>edge0</i>, <i>edge1</i>, <i>x</i>)<br />
Calculates a linear interpolation between 0 and 1 for a value _x_ within the range defined by _edge0_ and _edge1_. It applies a clamp to ensure the result stays within the 0.0 to 1.0 range.

<a name="smoothstep" href="#smoothstep">#</a>
<b>smoothstep</b>(<i>edge0</i>, <i>edge1</i>, <i>x</i>)<br />
Performs [smooth Hermite interpolation](https://en.wikipedia.org/wiki/Smoothstep) between 0 and 1 for values of _x_ that lie between _edge0_ and _edge1_. This function is particularly useful for scenarios requiring a threshold function with a smooth transition, offering a gradual rather than an abrupt change between states.
