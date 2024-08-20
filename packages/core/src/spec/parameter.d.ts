import { ChannelWithScale, Scalar } from "./channel.js";

export interface ExprRef {
    /**
     * The expression string.
     */
    expr: string;
}

export interface ParameterBase {
    /**
     * A unique name for the variable parameter. Parameter names should be valid
     * JavaScript identifiers: they should contain only alphanumeric characters
     * (or "$", or "_") and may not start with a digit. Reserved keywords that
     * may not be used as parameter names are: "datum".
     */
    name: string;

    push?: "outer";
}

// Adapted from: https://github.com/vega/vega-lite/blob/main/src/parameter.ts

export interface VariableParameter extends ParameterBase {
    /**
     * The [initial value](http://vega.github.io/vega-lite/docs/value.html) of the parameter.
     *
     * __Default value:__ `undefined`
     */
    value?: any;

    /**
     * An expression for the value of the parameter. This expression may include other parameters,
     * in which case the parameter will automatically update in response to upstream parameter changes.
     */
    expr?: string;

    /**
     * Binds the parameter to an external input element such as a slider, selection list or radio button group.
     */
    bind?: Binding;
}

// ----------------------------------------------------------------------------
// Adapted from: https://github.com/vega/vega/blob/main/packages/vega-typings/types/spec/bind.d.ts

export type Element = string;

export interface BindBase {
    /**
     * If defined, delays event handling until the specified milliseconds have
     * elapsed since the last event was fired.
     */
    debounce?: number;

    /**
     * By default, the parameter name is used to label input elements.
     * This `name` property can be used instead to specify a custom
     * label for the bound parameter.
     */
    name?: string;

    /**
     * An optional description or help text that is shown below the input element.
     */
    description?: string;
}

export interface BindInput extends BindBase {
    /**
     * The type of input element to use.
     * The valid values are `"checkbox"`, `"radio"`, `"range"`, `"select"`, `"text"`, `"number"`, and `"color"`.
     */
    input?: "text" | "number" | "color";

    /**
     * Text that appears in the form control when it has no value set.
     */
    placeholder?: string;

    /**
     * A hint for form autofill.
     * See the [HTML autocomplete attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete) for additional information.
     */
    autocomplete?: string;
}

export interface BindCheckbox extends BindBase {
    input: "checkbox";
}

export interface BindRadioSelect extends BindBase {
    input: "radio" | "select";
    /**
     * An array of options to select from.
     */
    options: any[];

    /**
     * An array of label strings to represent the `options` values. If
     * unspecified, the `options` value will be coerced to a string and
     * used as the label.
     */
    labels?: string[];
}

export interface BindRange extends BindBase {
    input: "range";

    /**
     * Sets the minimum slider value. Defaults to the smaller of the signal value and `0`.
     */
    min?: number;

    /**
     * Sets the maximum slider value. Defaults to the larger of the signal value and `100`.
     */
    max?: number;

    /**
     * Sets the minimum slider increment. If undefined, the step size will be
     * automatically determined based on the `min` and `max` values.
     */
    step?: number;
}

export interface BindDirect {
    /**
     * An input element that exposes a _value_ property and supports the
     * [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget)
     * interface, or a CSS selector string to such an element. When the element
     * updates and dispatches an event, the _value_ property will be used as the
     * new, bound signal value. When the signal updates independent of the
     * element, the _value_ property will be set to the signal value and a new
     * event will be dispatched on the element.
     */
    element: Element | EventTarget;

    /**
     * The event (default `"input"`) to listen for to track changes on the
     * external element.
     */
    event?: string;

    /**
     * If defined, delays event handling until the specified milliseconds have
     * elapsed since the last event was fired.
     */
    debounce?: number;
}

export type Binding = BindCheckbox | BindRadioSelect | BindRange | BindInput;

// ----------------------------------------------------------------------------
// Adapted from: https://github.com/vega/vega-lite/blob/main/src/selection.ts

type Vector2<T> = [T, T];

export type SelectionType = "point" | "interval";
export type SelectionInit = Scalar;
export type SelectionInitInterval =
    | Vector2<boolean>
    | Vector2<number>
    | Vector2<string>;

export type InteractionEventType = "click" | "dblclick" | "mouseover";

export interface BaseSelectionConfig<T extends SelectionType = SelectionType> {
    /**
     * Determines the default event processing and data query for the selection. Vega-Lite currently supports two selection types:
     *
     * - `"point"` -- to select multiple discrete data values; the first value is selected on `click` and additional values toggled on shift-click.
     * - `"interval"` -- to select a continuous range of data values on `drag`.
     */
    type: T;

    /**
     */
    on?: "click" | "mouseover" | "pointerover";

    /**
     * An array of encoding channels. The corresponding data field values
     * must match for a data tuple to fall within the selection.
     *
     * __See also:__ The [projection with `encodings` and `fields` section](https://vega.github.io/vega-lite/docs/selection.html#project) in the documentation.
     */
    encodings?: ChannelWithScale[];

    /**
     * An array of field names whose values must match for a data tuple to
     * fall within the selection.
     *
     * __See also:__ The [projection with `encodings` and `fields` section](https://vega.github.io/vega-lite/docs/selection.html#project) in the documentation.
     */
    fields?: string[];
}

export interface PointSelectionConfig extends BaseSelectionConfig<"point"> {
    type: "point";

    /**
     * Controls whether data values should be toggled (inserted or removed from a point selection)
     * when clicking with the shift key pressed.
     *
     * - `true` -- additional values can be selected by shift-clicking.
     * - `false` -- only a single value can be selected at a time.
     *
     * __Default value:__ `true`
     */
    toggle?: boolean;
    /**
     * A set of fields that uniquely identify a tuple. Used for bookmarking point selections
     * in the GenomeSpy App. Still work in progress.
     *
     * TODO: Or maybe use the `key` channel? https://vega.github.io/vega-lite/docs/encoding.html#key
     */
    //keyFields?: string[];
}

export interface IntervalSelectionConfig
    extends BaseSelectionConfig<"interval"> {
    // TODO
}

export interface SelectionParameter<T extends SelectionType = SelectionType>
    extends ParameterBase {
    /**
     * Determines the default event processing and data query for the selection. Vega-Lite currently supports two selection types:
     *
     * - `"point"` -- to select multiple discrete data values; the first value is selected on `click` and additional values toggled on shift-click.
     * - `"interval"` -- to select a continuous range of data values on `drag`.
     */
    select:
        | T
        | (T extends "point"
              ? PointSelectionConfig
              : T extends "interval"
              ? IntervalSelectionConfig
              : never);

    /*
     * Initialize the selection with a mapping between [projected channels or field names](https://vega.github.io/vega-lite/docs/selection.html#project) and initial values.
     *
     * __See also:__ [`init`](https://vega.github.io/vega-lite/docs/value.html) documentation.
     */
    /*
    // TODO TODO TODO TODO TODO TODO TODO TODO 
    value?: T extends "point"
        ? SelectionInit | SelectionInitMapping[]
        : T extends "interval"
        ? SelectionInitIntervalMapping
        : never;
        */
}

export type Parameter = VariableParameter | SelectionParameter;
