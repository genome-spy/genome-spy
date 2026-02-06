import { PrimaryPositionalChannel, Scalar } from "./channel.js";
import { ShadowProps } from "./mark.js";

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

export interface PersistedParameter {
    /**
     * Whether the parameter should be persisted in bookmarks and provenance.
     *
     * This primarily affects GenomeSpy App behavior.
     * Set to `false` for ephemeral params (e.g., hover selections) or when the
     * selection cannot be persisted due to missing `encoding.key`.
     *
     * __Default value:__ `true`
     */
    persist?: boolean;
}

// Adapted from: https://github.com/vega/vega-lite/blob/main/src/parameter.ts

export interface VariableParameter extends ParameterBase, PersistedParameter {
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

// TODO: merge with InteractionEventType
export type DomEventType = "click" | "dblclick" | "mouseover" | "pointerover";

export interface EventConfig {
    /**
     * The type of event to listen to. For example, `"click"` or `"mouseover"`.
     */
    type: DomEventType;

    /**
     * An optional filter expression to further filter events of the specified type.
     * The expression can only refer to the event object as `event`, and should
     * evaluate to a boolean value indicating whether to include the event.
     * No other data or parameters are in scope.
     */
    filter?: string;
}

export interface BaseSelectionConfig<T extends SelectionType = SelectionType> {
    /**
     * The selection type.
     *
     * - `"point"` -- to select multiple discrete data values; the first value is selected on `click` and additional values toggled on shift-click.
     * - `"interval"` -- to select a continuous range of data values on `drag`.
     */
    type: T;

    /**
     * A string or object that defines the events to which the selection should listen.
     */
    on?: DomEventType | EventConfig | string;

    /**
     * A string or object that defines the events that should clear the selection.
     *
     * __Default value:__ `"dblclick"`
     */
    clear?: DomEventType | EventConfig | string | boolean;
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
}

export interface IntervalSelectionConfig extends BaseSelectionConfig<"interval"> {
    type: "interval";

    /**
     * An array of encoding channels that define the interval selection.
     */
    encodings?: PrimaryPositionalChannel[];

    /**
     * Interval selections display a rectangle mark to show the selected range.
     * Use the `mark` property to adjust the appearance of this rectangle.
     */
    mark?: BrushConfig;
}

export interface BrushConfig extends ShadowProps {
    /**
     * The fill color of the interval mark.
     *
     * __Default value:__ `"#808080"`
     *
     */
    fill?: string;

    /**
     * The fill opacity of the interval mark (a value between `0` and `1`).
     *
     * __Default value:__ `0.05`
     */
    fillOpacity?: number;

    /**
     * The stroke color of the interval mark.
     *
     * __Default value:__ `"black"`
     */
    stroke?: string;

    /**
     * The stroke opacity of the interval mark (a value between `0` and `1`).
     *
     * __Default value:__ `0.2`
     */
    strokeOpacity?: number;

    /**
     * The stroke width of the interval mark.
     *
     * __Default value:__ `1`
     */
    strokeWidth?: number;

    /**
     * Where to display the measurement text (e.g., number of base pairs) for the interval selection.
     *
     * - `"none"` -- do not show the measurement.
     * - `"inside"` -- show inside the brush rectangle.
     * - `"outside"` -- show outside the brush rectangle.
     *
     * __Default value:__ `"none"`
     */
    measure?: "none" | "inside" | "outside";
}

export interface SelectionParameter<T extends SelectionType = SelectionType>
    extends ParameterBase, PersistedParameter {
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

    /**
     * Initial value for the selection.
     */
    value?: T extends "interval" ? SelectionInitIntervalMapping : never;
}

export type SelectionInitIntervalMapping = Partial<
    Record<PrimaryPositionalChannel, [number, number]>
>;

export type SelectionConfig = PointSelectionConfig | IntervalSelectionConfig;
export type SelectionTypeOrConfig = SelectionType | SelectionConfig;

export type Parameter = VariableParameter | SelectionParameter;
