import * as d3 from 'd3';
import CanvasTextCache from "../../utils/canvasTextCache";
import MouseTracker from "../../mouseTracker";
import * as html from "../../utils/html";
import Interval from '../../utils/interval';
import contextMenu from '../../contextMenu';

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

        const config = this.sampleTrack.config;

        // TODO: Consider a setSamples() method

        const ctx = this.sampleTrack.get2d(document.createElement("canvas"));
        ctx.font = `${config.fontSize}px ${config.fontFamily}`;
        this.maxLabelWidth = [...this.sampleTrack.samples.values()]
            .map(sample => ctx.measureText(sample.displayName).width)
            .reduce((a, b) => Math.max(a, b), 0);

        this.textCache = new CanvasTextCache(config.fontSize, config.fontFamily);
    }


    initialize() {
        this.labelCanvas = this.sampleTrack.createCanvas();

        this.attributeLabelCanvas = this.sampleTrack.createCanvas();
        this.attributeLabelCanvas.style.zIndex = "1";

        this.sampleMouseTracker = new MouseTracker({
            element: this.labelCanvas,
            tooltip: this.sampleTrack.genomeSpy.tooltip,
            resolver: this.sampleTrack.findSampleAt.bind(this.sampleTrack),
            // TODO: Map for samples
            tooltipConverter: sample => Promise.resolve(this.sampleToTooltip(sample))
        })
            .on("contextmenu", this.createContextMenu.bind(this));

        this.attributeLabelMouseTracker = new MouseTracker({
            element: this.attributeLabelCanvas,
            tooltip: this.sampleTrack.genomeSpy.tooltip,
            resolver: this.findAttributeAt.bind(this),
            tooltipConverter: attribute => Promise.resolve(attribute)
        })
            .on("click", attribute => this.sampleTrack.sortSamples(s => s.attributes[attribute]))
            .on("mouseover", attribute => this.renderAttributeLabels({ hoveredAttribute: attribute }))
            .on("mouseleave", () => this.renderAttributeLabels());

        this.prepareSampleAttributes();

    }

    getMinWidth() {
        return this.maxLabelWidth +
            this.sampleTrack.config.horizontalSpacing +
            this.attributeScales.size * this.sampleTrack.config.attributeWidth +
            this.sampleTrack.config.horizontalSpacing;
    }

    /**
     * 
     * @param {object} sample 
     * @param {MouseEvent} mouseEvent 
     */
    createContextMenu(sample, mouseEvent, point) {
        const attribute = this.findAttributeAt(point)

        if (!sample || !attribute) {
            mouseEvent.preventDefault();
            return;
        }

        const attributeValue = sample.attributes[attribute];

        const nominal = typeof attributeValue == "string";

        /** @type {import("../../contextMenu").MenuItem[]} */
        let items = [
            {
                label: `Attribute: ${attribute}`,
                type: "header"
            },
            {
                label: "Sort by",
                callback: () => this.sampleTrack.sortSamples(s => s.attributes[attribute])
            }
        ]

        if (nominal) {
            items.push({
                label: "Retain first sample of each",
                callback: () => alert("TODO")
            })
        }

        if (nominal) {
            items = [...items, ...[
                {
                    type: "divider"
                },
                {
                    label: `Samples with ${attribute} = ${attributeValue}`,
                    type: "header"
                },
                {
                    label: "Retain",
                    callback: () => this.sampleTrack.updateSamples(this.sampleTrack.sampleOrder
                        .filter(sampleId => this.sampleTrack.samples.get(sampleId).attributes[attribute] === attributeValue))
                },
                {
                    label: "Remove",
                    callback: () => this.sampleTrack.updateSamples(this.sampleTrack.sampleOrder
                        .filter(sampleId => this.sampleTrack.samples.get(sampleId).attributes[attribute] !== attributeValue))
                },
                {
                    label: "Add missing samples",
                    callback: () => alert("TODO")
                },
            ]];
        }

        contextMenu({ items }, mouseEvent);

        mouseEvent.preventDefault();
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
        this.sampleTrack.adjustCanvas(this.attributeLabelCanvas, axisInterval, 100);
        this.attributeLabelCanvas.style.top = `${trackHeight}px`;

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
        builder.add(this.sampleTrack.config.horizontalSpacing);
        this.attributeInterval = builder.add(this.attributeScales.size * this.sampleTrack.config.attributeWidth);
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

            const band = leftScale.scale(sampleId).mix(rightScale.scale(sampleId), yTransitionProgress);

            if (band.width() > 0) {
                const fontSize = Math.min(this.sampleTrack.config.fontSize, band.width());

                this.textCache.fillText(ctx,
                    sample.displayName,
                    this.labelInterval.lower,
                    band.centre(),
                    fontSize);

                this.attributeScales
                    .forEach((valueScale, key) => {
                        ctx.fillStyle = valueScale(sample.attributes[key]);
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
        const ctx = this.sampleTrack.get2d(this.attributeLabelCanvas);
        ctx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

        ctx.save();

        const fontSize = Math.min(this.attributeBandScale.bandwidth() * 1.15, this.sampleTrack.config.fontSize);
        ctx.font = `${fontSize}px ${this.sampleTrack.config.fontFamily}`;
        
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
        const numberFormat = d3.format(".4");

        const formatValue = value => {
            if (typeof value == "number") {
                return numberFormat(value);
            } else if (typeof value == "string") {
                return value;
            } else {
                return "";
            }
        };

        const table = '<table class="attributes"' +
            Object.entries(sample.attributes).map(([key, value]) => `
                <tr>
                    <th>${html.escapeHtml(key)}</th>
                    <td>${html.escapeHtml(formatValue(value))}</td>
                    <td class="color" style="background-color: ${this.attributeScales.get(key)(value)}"></td>
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
            //.flatMap(sample => Object.keys(sample.attributes))
            .reduce((acc, sample) => acc.concat(Object.keys(sample.attributes)), []) // Firefox 60 ESR
            .reduce((set, key) => set.add(key), new Set());

        const inferNumerality = attributeName => samples
            .map(sample => sample.attributes[attributeName])
            .filter(value => typeof value == "string")
            .filter(value => value !== "")
            .every(value => /^[+-]?\d+(\.\d*)?$/.test(value));

        this.attributeScales = new Map();

        // TODO: Make all of this configurable

        attributeNames.forEach(attributeName => {
            if (inferNumerality(attributeName)) {
                const accessor = sample => sample.attributes[attributeName];

                // Convert types
                for (let sample of samples.values()) {
                    sample.attributes[attributeName] = parseFloat(accessor(sample));
                }

                const extent = d3.extent(samples, accessor);
                this.attributeScales.set(
                    attributeName,
                    d3.scaleSequential(d3.interpolateOrRd)
                        .domain(extent));

                // TODO: Diverging scale if domain extends to negative values

            } else {
                this.attributeScales.set(attributeName, d3.scaleOrdinal(d3.schemeCategory10));
            }
        });


        // Map a attribute name to a horizontal coordinate
        this.attributeBandScale = d3.scaleBand()
            .domain(Array.from(attributeNames.keys()))
            .paddingInner(this.sampleTrack.config.attributePaddingInner)
            // TODO: Move to renderLabels()
            .range([0, this.sampleTrack.config.attributeWidth * attributeNames.size]);
    }

}