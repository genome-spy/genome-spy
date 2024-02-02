export interface ExprRef {
    /**
     * The expression string.
     */
    expr: string;
}

// Adapted from: https://github.com/vega/vega-lite/blob/main/src/parameter.ts

export interface VariableParameter {
    /**
     * A unique name for the variable parameter. Parameter names should be valid
     * JavaScript identifiers: they should contain only alphanumeric characters
     * (or "$", or "_") and may not start with a digit. Reserved keywords that
     * may not be used as parameter names are: "datum".
     */
    name: string;

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
    expr?: Expr;

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

export type Binding = BindCheckbox | BindRadioSelect | BindRange;
