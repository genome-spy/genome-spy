import SingleAxisLazySource from "./singleAxisLazySource.js";
/**
 * @typedef {import("../../../types/encoder.js").VegaScale} VegaScale
 * @typedef {VegaScale & { props: import("../../../spec/scale.js").Scale }} ScaleWithProps
 */

/**
 * Create measure data associated with the channel.
 * Can be used to generate a visual clue ("measure") for the current zoom level.
 */
export default class AxisMeasureSource extends SingleAxisLazySource {
    /** @type {number} */
    startPos = 0;
    /** @type {number} */
    endPos = 0;
    /** @type {number} */
    centerPos = 0;
    /** @type {string} */
    measureLabel = "";
    /** @type {number} */
    measureDomainSize = 1;
    /** @type {number[]} */
    measureValues = [];
    /** @type {string[]} */
    measureLabels = [];
    /** @type {(string | number)[][]} */
    measureEntries = [];
    /** @type {Object.<number, string>} */
    measureLabeledValues = {};

    updateSpanLabeledValues() {
        this.measureValues = Array.from(
            { length: Math.floor(Math.log10(this.genome.totalSize)) + 1 },
            (_, i) => this.params.multiplierValue * 10 ** i
        );
        const units = ["b", "kb", "Mb", "Gb"]; // bases, kilobases, megabases, gigabases
        this.measureLabels = this.measureValues.map((value, index) => {
            // Determine the appropriate unit index
            const unitIndex = Math.floor(index / 3); // Each unit corresponds to three values in measureValues
            // Format the value according to its magnitude
            const formattedValue = value / 10 ** (unitIndex * 3);
            return `${formattedValue}${units[unitIndex]}`;
        });
        this.measureEntries = this.measureValues.map((value, index) => [
            value,
            this.measureLabels[index],
        ]);
        this.measureLabeledValues = Object.fromEntries(this.measureEntries);
    }

    /**
     * @param {import("../../../spec/data.js").AxisMeasureData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").AxisMeasureData} params */
        const paramsWithDefaults = {
            channel: "x",
            minMeasureSize: 50,
            hideMeasureThreshold: 10,
            multiplierValue: 1,
            alignMeasure: "center",
            ...params,
        };

        super(view, paramsWithDefaults.channel);
        this.params = paramsWithDefaults;
        this.updateSpanLabeledValues();
    }
    /** Function that calculates the domain coordinates
     * of the measure, given the alignment parameter,
     * the current scale domain and the size of the
     * measure in domain units
     *
     * @param {string} alignMeasure
     * @param {ScaleWithProps} scale
     * @param {number} measureDomainSize
     */
    calculateCoord(alignMeasure, scale, measureDomainSize) {
        let coordLeft, coordCenter, coordRight;
        switch (alignMeasure) {
            case "left":
            case "bottom": // Fall-through case for 'bottom' along with 'left'
                coordLeft = scale.domain()[0];
                coordRight = coordLeft + measureDomainSize;
                coordCenter = Math.floor((coordLeft + coordRight) / 2);
                break;
            case "center":
                // @ts-ignore
                coordCenter = scale.invert(0.5);
                coordLeft = coordCenter - Math.floor(measureDomainSize / 2);
                coordRight = coordCenter + Math.floor(measureDomainSize / 2);
                break;
            case "right":
            case "top": // Fall-through case for 'top' along with 'right'
                coordRight = scale.domain()[1];
                coordLeft = coordRight - measureDomainSize;
                coordCenter = Math.floor((coordLeft + coordRight) / 2);
                break;
            default:
                console.error("Invalid alignMeasure value");
                return null; // Return null or handle as necessary for invalid inputs
        }
        return [coordLeft, coordCenter, coordRight];
    }

    onDomainChanged() {
        /** @type {ScaleWithProps} scale */
        const scale = this.scaleResolution.scale;
        const axisLength = this.getAxisLength();
        const minMeasureSize = this.params.minMeasureSize;
        const alignMeasure = this.params.alignMeasure;
        const hideMeasureThreshold = this.params.hideMeasureThreshold;
        // Find the size (in domain units) of a measure
        // that shows minMeasureSize pixels wide
        const minValueSize = Math.floor(
            // @ts-ignore
            scale.invert(minMeasureSize / axisLength) - scale.invert(0)
        );
        // Find the first measure size (in domain units) that produces a range
        // bigger than the minimum requested size measure in pixels
        const measureDomainSize = this.measureValues.find(
            (value) => value > minValueSize
        );
        const measureLabel = this.measureLabeledValues[measureDomainSize];
        // Position the measure according to the alignMeasure parameter
        const [startPos, centerPos, endPos] = this.calculateCoord(
            alignMeasure,
            scale,
            measureDomainSize
        );
        const measurePixelsSize = Math.floor(
            (scale(endPos) - scale(startPos)) * axisLength
        );
        if (measureDomainSize <= hideMeasureThreshold) {
            this.publishData([]); // hide the measure by publishing an empty array
        } else {
            if (startPos != this.startPos || endPos != this.endPos) {
                this.publishData([
                    [
                        {
                            startPos: startPos,
                            endPos: endPos,
                            centerPos: centerPos,
                            measureDomainSize: measureDomainSize,
                            measurePixelsSize: measurePixelsSize,
                            measureLabel: measureLabel,
                        },
                    ],
                ]);
            }
        }
    }
}
