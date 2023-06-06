import { Type } from "./channel";
import { Data } from "./data";
import { Align, FontStyle, FontWeight } from "./font";
import { Scale } from "./scale";
import { LayerSpec, UnitSpec, ViewSpecBase, ViewBackground } from "./view";

// TODO: Figure out how this could be moved to the app package and excluded
// from the core package.

/**
 * A view specification for a SampleView.
 * This is only functional in the GenomeSpy app.
 */
export interface SampleSpec extends ViewSpecBase {
    /**
     * Sample metadata definition.
     * If the object is empty, the sample identifiers will be inferred from the data.
     */
    samples: SampleDef;

    /**
     * An object defining the view background and outline. The background is
     * repeated for each group.
     */
    view?: ViewBackground;
    /**
     * The view specification to be repeated for each sample.
     */
    spec: LayerSpec | UnitSpec;

    stickySummaries?: boolean;
}

export interface SampleAttributeDef {
    /**
     * The attribute type. One of `"nominal"`, `"ordinal"`, or `"quantitative"`.
     */
    type: Type; // TODO: Omit index/locus from available types

    /**
     * Scale definition for the (default) color channel
     */
    scale?: Scale;

    /**
     * An optional scale definition for mapping the attribute to
     * the width of a metadata rectangle.
     */
    barScale?: Scale;

    /**
     * Width of the column in pixels.
     */
    width?: number;

    /**
     * Whether the attribute is visible by default.
     */
    visible?: boolean;
}

export interface SampleDef {
    /**
     * Optional metadata about the samples.
     */
    data?: Data;

    /**
     * Explicitly specify the sample attributes.
     */
    attributes?: Record<string, SampleAttributeDef>;

    /**
     * Text in the label title
     *
     * **Default:** `"Sample name"`
     */
    labelTitleText?: string;

    /**
     * How much space in pixels to reserve for the labels.
     *
     * **Default:** `140`
     */
    labelLength?: number;

    /**
     * The font typeface. GenomeSpy uses [SDF](https://github.com/Chlumsky/msdfgen)
     * versions of [Google Fonts](https://fonts.google.com/). Check their
     * availability at the [A-Frame
     * Fonts](https://github.com/etiennepinchon/aframe-fonts/tree/master/fonts)
     * repository. System fonts are **not** supported.
     *
     * **Default value:** `"Lato"`
     */
    labelFont?: string;

    /**
     * The font style. Valid values: `"normal"` and `"italic"`.
     *
     * **Default value:** `"normal"`
     */
    labelFontStyle?: FontStyle;

    /**
     * The font weight. The following strings and numbers are valid values:
     * `"thin"` (`100`), `"light"` (`300`), `"regular"` (`400`),
     * `"normal"` (`400`), `"medium"` (`500`), `"bold"` (`700`),
     * `"black"` (`900`)
     *
     * **Default value:** `"regular"`
     */
    labelFontWeight?: FontWeight;

    /**
     * The font size in pixels.
     *
     * **Default value:** `11`
     */
    labelFontSize?: number;

    /**
     * The horizontal alignment of the text. One of `"left"`, `"center"`, or `"right"`.
     *
     * **Default value:** `"left"`
     */
    labelAlign?: Align;

    /**
     * Default size (width) of the metadata attribute columns.
     * Can be configured per attribute using the `attributes` property.
     *
     * **Default value:** `10`
     */
    attributeSize?: number;

    /**
     * The font typeface. GenomeSpy uses [SDF](https://github.com/Chlumsky/msdfgen)
     * versions of [Google Fonts](https://fonts.google.com/). Check their
     * availability at the [A-Frame
     * Fonts](https://github.com/etiennepinchon/aframe-fonts/tree/master/fonts)
     * repository. System fonts are **not** supported.
     *
     * **Default value:** `"Lato"`
     */
    attributeLabelFont?: string;

    /**
     * The font style. Valid values: `"normal"` and `"italic"`.
     *
     * **Default value:** `"normal"`
     */
    attributeLabelFontStyle?: FontStyle;

    /**
     * The font weight. The following strings and numbers are valid values:
     * `"thin"` (`100`), `"light"` (`300`), `"regular"` (`400`),
     * `"normal"` (`400`), `"medium"` (`500`), `"bold"` (`700`),
     * `"black"` (`900`)
     *
     * **Default value:** `"regular"`
     */
    attributeLabelFontWeight?: FontWeight;

    /**
     * The font size in pixels.
     *
     * **Default value:** `11`
     */
    attributeLabelFontSize?: number;

    /**
     * Angle to be added to the default label angle (-90).
     *
     * **Default value:** `0`
     */
    attributeLabelAngle?: number;

    /**
     * Spacing between attribute columns in pixels.
     *
     * **Default value:** `1`
     */
    attributeSpacing?: number;
}
