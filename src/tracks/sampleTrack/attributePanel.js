import { format as d3format } from 'd3-format';
import { scaleSequential, scaleOrdinal, scaleBand } from 'd3-scale';
import { schemeCategory10, interpolateOrRd } from 'd3-scale-chromatic';
import { quantile, extent } from 'd3-array';

import CanvasTextCache from "../../utils/canvasTextCache";
import MouseTracker from "../../mouseTracker";
import * as html from "../../utils/html";
import Interval from '../../utils/interval';
import contextMenu from '../../contextMenu';
import { inferNumeric } from '../../utils/variableTools';

function isDefined(value) {
    return value !== "" && !(typeof value == "number" && isNaN(value)) && value !== null;
}

/**
 * Handles sample names and attributes
 * 
 * Purpose of this class is to keep SampleTrack less convoluted
 */
export default class AttributePanel {
    /**
     * 
     * @param {import("./sampleTrack").default} sampleTrack 
     */
    constructor(sampleTrack) {
        this.sampleTrack = sampleTrack;

        this.styles = this.sampleTrack.styles;

        this.textCache = new CanvasTextCache(this.styles.fontSize, this.styles.fontFamily);
    }


    initialize() {
        this.prepareSampleAttributes();

        this.labelCanvas = this.sampleTrack.createCanvas();

        this.sampleMouseTracker = new MouseTracker({
            element: this.labelCanvas,
            tooltip: this.sampleTrack.genomeSpy.tooltip,
            resolver: this.sampleTrack.findSampleAt.bind(this.sampleTrack),
            // TODO: Map for samples
            tooltipConverter: sample => Promise.resolve(this.sampleToTooltip(sample))
        })
            .on("contextmenu", this.createContextMenu.bind(this));

        // TODO: Consider a setSamples() method
        const ctx = this.sampleTrack.get2d(document.createElement("canvas"));
        ctx.font = `${this.styles.fontSize}px ${this.styles.fontFamily}`;

        this.maxLabelWidth = quantile(
            [...this.sampleTrack.samples.values()]
                .map(sample => ctx.measureText(sample.displayName).width),
            0.95);

        if (this.attributeScales.size > 0) {
            this.attributeLabelCanvas = this.sampleTrack.createCanvas();
            this.attributeLabelCanvas.style.zIndex = "1";

            this.attributeLabelMouseTracker = new MouseTracker({
                element: this.attributeLabelCanvas,
                tooltip: this.sampleTrack.genomeSpy.tooltip,
                resolver: this.findAttributeAt.bind(this),
                tooltipConverter: attribute => Promise.resolve(attribute)
            })
                .on("click", attribute => this.sampleTrack.sortSamples(s => s.attributes[attribute]))
                .on("mouseover", attribute => this.renderAttributeLabels({ hoveredAttribute: attribute }))
                .on("mouseleave", () => this.renderAttributeLabels());

        }

    }

    getMinWidth() {
        return this.maxLabelWidth +
            this.sampleTrack.styles.horizontalSpacing +
            this.attributeScales.size * this.sampleTrack.styles.attributeWidth +
            this.sampleTrack.styles.horizontalSpacing;
    }

    /**
     * 
     * @param {object} sample 
     * @param {MouseEvent} mouseEvent 
     */
    createContextMenu(sample, mouseEvent, point) {

        /** @type {import("../../contextMenu").MenuItem[]} */
        let items = [];

        const attribute = this.findAttributeAt(point)

        if (!sample) {
            mouseEvent.preventDefault();
            return;
        }

        // TODO: Sample management may need its own class.
        // The following code is scattered with: this.sampleTrack

        if (attribute) {
            // TODO: Sorting and filtering actions should be implemented as command objects,
            // which can be replayed on the original data

            const filterByAttributeValue = (/** @type {function(any, any)} */ operator) => 
                this.sampleTrack.updateSamples(this.sampleTrack.sampleOrder
                    .filter(sampleId => operator(this.sampleTrack.samples.get(sampleId).attributes[attribute], attributeValue)));

            const attributeValue = sample.attributes[attribute];

            const nominal = typeof attributeValue == "string";

            items = items.concat([
                {
                    label: `Attribute: ${attribute}`,
                    type: "header"
                },
                {
                    label: "Sort by",
                    callback: () => this.sampleTrack.sortSamples(s => s.attributes[attribute])
                }
            ])

            if (nominal) {
                
                items.push({
                    label: "Retain first sample of each",
                    callback: () => {
                        const included = new Set();
                        const checkAndAdd = key => {
                            const has = included.has(key);
                            included.add(key);
                            return has;
                        };

                        this.sampleTrack.updateSamples(
                            this.sampleTrack.sampleOrder
                                .map(sampleId => this.sampleTrack.samples.get(sampleId))
                                .filter(sample => !checkAndAdd(sample.attributes[attribute]))
                                .map(sample => sample.id));
                    }
                })
            }

            if (nominal) {
                items = items.concat([
                    {
                        type: "divider"
                    },
                    {
                        label: attributeValue === "" ?
                            `Samples with undefined ${attribute}` :
                            `Samples with ${attribute} = ${attributeValue}`,
                        type: "header"
                    },
                    {
                        label: "Retain",
                        callback: () => filterByAttributeValue((a, chosen) => a === chosen)
                    },
                    {
                        label: "Remove",
                        callback: () => filterByAttributeValue((a, chosen) => a !== chosen)
                    },
                    {
                        label: "Add missing samples",
                        callback: () => alert("TODO")
                    },
                ]);

            } else {
                const numberFormat = d3format(".4");

                items = items.concat([
                    {
                        type: "divider"
                    }]);

                if (isDefined(attributeValue)) {
                    items = items.concat([
                        {
                            label: `Remove ${attribute} less than ${numberFormat(attributeValue)}`,
                            callback: () => filterByAttributeValue((a, chosen) => isNaN(a) || a >= chosen)
                        },
                        {
                            label: `Remove ${attribute} greater than ${numberFormat(attributeValue)}`,
                            callback: () => filterByAttributeValue((a, chosen) => isNaN(a) || a <= chosen)
                        }
                    ]);

                } else {
                    items = items.concat([
                        {
                            label: `Remove undefined ${attribute}`,
                            callback: () => filterByAttributeValue((a, chosen) => !isNaN(a))
                        }
                    ]);
                }
            }

        } else {
            items = items.concat([
                {
                    label: `Sample: ${sample.displayName}`,
                    type: "header"
                },
                {
                    label: "Remove",
                    callback: () => this.sampleTrack.updateSamples(
                        this.sampleTrack.sampleOrder.filter(id => id != sample.id))
                }

            ])
        }


        contextMenu({ items }, mouseEvent);
    }

    /**
     * 
     * @param {Interval} axisInterval 
     */
    resizeCanvases(axisInterval) {
        const trackHeight = this.sampleTrack.trackContainer.clientHeight;

        this.sampleTrack.adjustCanvas(this.labelCanvas, axisInterval, trackHeight);

        // TODO: Compute available vertical space
        // TODO: Compute position: above or below
        if (this.attributeLabelCanvas) {
        this.sampleTrack.adjustCanvas(this.attributeLabelCanvas, axisInterval, 100);
        this.attributeLabelCanvas.style.top = `${trackHeight}px`;
        }

        // TODO: Need a real layoutbuilder
        const builder = {
            tail: 0,
            add: function(width) {
                const int = new Interval(this.tail, this.tail + width);
                this.tail += width;
                return int;
            }
        } 

        this.labelInterval = builder.add(Math.ceil(this.maxLabelWidth));
        builder.add(this.sampleTrack.styles.horizontalSpacing);
        this.attributeInterval = builder.add(this.attributeScales.size * this.sampleTrack.styles.attributeWidth);
    }


    /**
     * Render the axis area, which contains labels and sample-specific attributes 
     * 
     * @typedef {Object} RenderOptions
     * @property {import("../../utils/BandScale").default} leftScale
     * @property {import("../../utils/BandScale").default} rightScale
     * @property {number} xTransitionProgress
     * @property {number} yTransitionProgress
     * 
     * @param {RenderOptions} [options]
     */
    renderLabels(options) {
        // TODO: Implement in WebGL

        const leftScale = (options && options.leftScale) || this.sampleTrack.sampleScale;
        const rightScale = (options && options.rightScale) || this.sampleTrack.sampleScale;
        const yTransitionProgress = (options && options.yTransitionProgress) || 0;

        const ctx = this.sampleTrack.get2d(this.labelCanvas);
        ctx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

        leftScale.getDomain().forEach(sampleId => {
            const sample = this.sampleTrack.samples.get(sampleId);
            //const band = scale.scale(sampleId);

            const band = leftScale.scale(sampleId)
                .mix(rightScale.scale(sampleId), yTransitionProgress)
                .transform(this.sampleTrack.yTransform);

            if (band.width() > 0) {
                const fontSize = Math.min(this.sampleTrack.styles.fontSize, band.width());

                this.textCache.fillText(ctx,
                    sample.displayName,
                    this.labelInterval.lower,
                    band.centre(),
                    fontSize);

                this.attributeScales
                    .forEach((valueScale, key) => {
                        const value = sample.attributes[key];
                        
                        ctx.fillStyle = isDefined(value) ? valueScale(value) : this.styles.naColor;
                        ctx.fillRect(
                            this.attributeInterval.lower + this.attributeBandScale(key),
                            band.lower,
                            this.attributeBandScale.bandwidth(),
                            band.width());
                    });
            }
        });
    }

    /**
     * @typedef {object} RenderAttributeLabelOptions
     * @prop {string} hoveredAttribute
     * 
     * @param {RenderAttributeLabelOptions} [options]
     */
    renderAttributeLabels(options) {
        if (!this.attributeLabelCanvas) {
            return;
        }

        const ctx = this.sampleTrack.get2d(this.attributeLabelCanvas);
        ctx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

        ctx.save();

        const fontSize = Math.min(this.attributeBandScale.bandwidth() * 1.15, this.sampleTrack.styles.fontSize);
        ctx.font = `${fontSize}px ${this.sampleTrack.styles.fontFamily}`;
        
        ctx.textBaseline = "middle";

        // TODO: Support labels above 

        ctx.rotate(0.5 * Math.PI);
        ctx.translate(0,
            -this.attributeInterval.lower -
            this.attributeBandScale.bandwidth() / 2);

        this.attributeBandScale.domain().forEach(attribute => {
            // TODO: Configurable colors
            ctx.fillStyle = attribute == (options && options.hoveredAttribute) ? "red" : "black";
            ctx.fillText(
                attribute,
                2,
                -this.attributeBandScale(attribute));
        });

        ctx.restore();

    }


    findAttributeAt(point) {
        const x = point[0] - this.attributeInterval.lower;

        // TODO: Consider using BandScale class instead of d3's scaleBand
        return this.attributeBandScale.domain()
            .find(attribute => {
                const bandX = this.attributeBandScale(attribute);
                return x >= bandX && x < bandX + this.attributeBandScale.bandwidth();
            });
    }


    sampleToTooltip(sample) {
        const numberFormat = d3format(".4");

        const formatValue = value => {
            if (!isDefined(value)) {
                return "";
            } else if (typeof value == "number") {
                return numberFormat(value);
            } else if (typeof value == "string") {
                return value;
            } else {
                return "";
            }
        };

        const getColor = (key, value) => isDefined(value) ?
            this.attributeScales.get(key)(value) :
            this.styles.naColor;

        const table = '<table class="attributes"' +
            Object.entries(sample.attributes).map(([key, value]) => `
                <tr>
                    <th>${html.escapeHtml(key)}</th>
                    <td>${html.escapeHtml(formatValue(value))}</td>
                    <td class="color" style="background-color: ${getColor(key, value)}"></td>
                </tr>`
            ).join("") +
            "</table>";
        
        return `
        <div class="sample-track-sample-tooltip">
            <div class="title">
                <strong>${html.escapeHtml(sample.id)}</strong>
            </div>

            ${table}
        </div>`
    }



    /**
     * Builds scales for sample-specific attributes, e.g. clinical data
     */
    prepareSampleAttributes() {
        const samples = [...this.sampleTrack.samples.values()];

        // Find all attributes
        const attributeNames = samples
            .flatMap(sample => Object.keys(sample.attributes))
            .reduce((set, key) => set.add(key), new Set());

        this.attributeScales = new Map();

        // TODO: Make all of this configurable

        attributeNames.forEach(attributeName => {
            const accessor = sample => sample.attributes[attributeName];
            if (inferNumeric(samples.map(accessor))) {

                // Convert types
                for (let sample of samples.values()) {
                    sample.attributes[attributeName] = parseFloat(accessor(sample));
                }

                this.attributeScales.set(
                    attributeName,
                    scaleSequential(interpolateOrRd)
                        .domain(extent(samples, accessor)));

                // TODO: Diverging scale if domain extends to negative values

            } else {
                this.attributeScales.set(attributeName, scaleOrdinal(schemeCategory10));
            }
        });


        // Map a attribute name to a horizontal coordinate
        this.attributeBandScale = scaleBand()
            .domain(Array.from(attributeNames.keys()))
            .paddingInner(this.sampleTrack.styles.attributePaddingInner)
            // TODO: Move to renderLabels()
            .range([0, this.sampleTrack.styles.attributeWidth * attributeNames.size]);
    }

}