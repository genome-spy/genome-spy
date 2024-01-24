// Adapted from: https://github.com/vega/vega-lite/blob/main/src/parameter.ts

export interface VariableParameter {
    /**
     * A unique name for the variable parameter. Parameter names should be valid
     * JavaScript identifiers: they should contain only alphanumeric characters
     * (or "$", or "_") and may not start with a digit. Reserved keywords that
     * may not be used as parameter names are: "datum".
     */
    name: ParameterName;

    /**
     * The [initial value](http://vega.github.io/vega-lite/docs/value.html) of the parameter.
     *
     * __Default value:__ `undefined`
     */
    value?: any;
}
