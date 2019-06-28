import * as twgl from 'twgl-base.js';
import { scaleOrdinal } from 'd3-scale';
import { color, hsl } from 'd3-color';
import VERTEX_SHADER from '../gl/rect.vertex.glsl';
import FRAGMENT_SHADER from '../gl/rect.fragment.glsl';
import { segmentsToVertices } from '../gl/segmentsToVertices';
import Genome, { parseUcscCytobands } from '../genome/genome';
import Interval from "../utils/interval";
import WebGlTrack from "./webGlTrack";


const giemsaScale = scaleOrdinal()
    .domain([
        "gneg", "gpos25", "gpos50", "gpos75", "gpos100", "acen", "stalk", "gvar"
    ]).range([
        "#f0f0f0", "#e0e0e0", "#d0d0d0", "#c0c0c0", "#a0a0a0", "#cc4444", "#338833", "#000000"
    ].map(str => ({
        background: color(str),
        foreground: color(hsl(str).l < 0.5 ? "#ddd" : "black"),
        shadow: color(hsl(str).l < 0.5 ? "transparent" : "rgba(255, 255, 255, 0.25)")
    })));


const defaultStyles = {
    fontSize: 11,
    fontFamily: "sans-serif",

    labelMargin: 5
};

function mapUcscCytobands(chromMapper, cytobands) {
    return cytobands.map(band => ({
        interval: chromMapper.segmentToContinuous(
            band.chrom, band.chromStart, band.chromEnd),
        name: band.name,
        chrom: band.chrom,
        gieStain: band.gieStain
    }));
}

function computePaddings(band) {
    if (band.gieStain == "acen") {
        if (band.name.startsWith("p")) {
            return { paddingTopRight: 0.5, paddingBottomRight: 0.5 };

        } else if (band.name.startsWith("q")) {
            return { paddingTopLeft: 0.5, paddingBottomLeft: 0.5 };

        }
    }
    return {};
}

/**
 * A track that displays cytobands
 */
export default class CytobandTrack extends WebGlTrack {
    constructor(genomeSpy, config) {
        super(genomeSpy, config);

        this.styles = defaultStyles;

        this.genome = genomeSpy.coordinateSystem;
        if (!(this.genome instanceof Genome)) {
            throw new Error("The coordinate system is not genomic!");
        }
    }

    /**
     * @param {HTMLElement} trackContainer 
     */
    async initialize(trackContainer) {
        await super.initialize(trackContainer);

        this.trackContainer.className = "cytoband-track";
        this.trackContainer.style.height = "21px";

        const cytobands = parseUcscCytobands(
            await fetch(`genome/cytoBand.${this.genome.name}.txt`, { credentials: 'include' }).then(res => res.text()));

        this.mappedCytobands = mapUcscCytobands(this.genome.chromMapper, cytobands);

        this.initializeWebGL();

        // TODO: Create textures for labels and render everything with WebGL
        this.bandLabelCanvas = this.createCanvas();

        const ctx = this.get2d(this.bandLabelCanvas);
        ctx.font = `${this.styles.fontSize}px ${this.styles.fontFamily}`;
        this._bandLabelWidths = this.mappedCytobands.map(band => ctx.measureText(band.name).width);

        this._minBandLabelWidth = this._bandLabelWidths.reduce((a, b) => Math.min(a, b), Infinity);

        this.genomeSpy.on("zoom", () => {
            this.render();
        });

        this.genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.render();
        });

        this.genomeSpy.zoom.attachZoomEvents(this.bandLabelCanvas);
    }

    initializeWebGL() {
        this.glCanvas = this.createCanvas();
        const gl = this.glCanvas.getContext("webgl");
        this.gl = gl;

        gl.clearColor(1, 1, 1, 1);

        this.programInfo = twgl.createProgramInfo(gl, [ VERTEX_SHADER, FRAGMENT_SHADER ]);

        const vertices = segmentsToVertices(
            this.mappedCytobands.map(band => Object.assign(
                {
                    interval: band.interval,
                    colorTop: giemsaScale(band.gieStain).background.darker(0.3),
                    colorBottom: giemsaScale(band.gieStain).background.brighter(0.1)
                },
                computePaddings(band)
            ))
        );

        this.bufferInfo = twgl.createBufferInfoFromArrays(this.gl, vertices.arrays);

        gl.useProgram(this.programInfo.program);
        twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);
        twgl.setUniforms(this.programInfo, {
            // TODO: Move to base class / abstraction
            yPosLeft: [0, 1],
            yPosRight: [0, 1],
            uYDomainBegin: 0,
            uYDomainWidth: 1,
            ONE: 1.0, // fp64 hack
        });
    }

    resizeCanvases(layout) {
        this.adjustCanvas(this.bandLabelCanvas, layout.viewport);
        this.adjustCanvas(this.glCanvas, layout.viewport);
        this.adjustGl(this.gl);
        this.viewportDimensions = { width: layout.viewport.width(), height: this.trackContainer.clientHeight };
    }


    render() {
        this.renderBands();
        this.renderLabels();
        this.renderChromosomeBoundaries();
    }

    renderBands() {
        const gl = this.gl;

        gl.clear(gl.COLOR_BUFFER_BIT);

        twgl.setUniforms(this.programInfo, this.getDomainUniforms());
        twgl.drawBufferInfo(gl, this.bufferInfo, gl.TRIANGLE_STRIP);
    }

    renderLabels() {
        const scale = this.genomeSpy.getZoomedScale();
        const viewportRange = Interval.fromArray(scale.range()); // TODO: Provide this from somewhere

        const ctx = this.get2d(this.bandLabelCanvas);
        ctx.font = `${this.styles.fontSize}px ${this.styles.fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";

        const r = window.devicePixelRatio || 1;
        ctx.shadowOffsetY = 1.0 * r;

        ctx.clearRect(0, 0, this.viewportDimensions.width, this.viewportDimensions.height);

        const y = this.viewportDimensions.height / 2;

        const minLabelWidthInDomain = scale.invert(this._minBandLabelWidth + 2 * this.styles.labelMargin) - scale.invert(0);
        const viewportDomain = this.genomeSpy.getViewportDomain();

        this.mappedCytobands.forEach((band, i) => {
            // TODO: Subset by binary search or something
            if (!viewportDomain.connectedWith(band.interval) || band.interval.width() < minLabelWidthInDomain) {
                return;
            }
            
            const scaledInt = band.interval.transform(scale);
            const labelWidth = this._bandLabelWidths[i];

            if (scaledInt.connectedWith(viewportRange) &&
                scaledInt.width() > labelWidth + this.styles.labelMargin * 2) {
                let x = scaledInt.centre();

                const colors = giemsaScale(band.gieStain);
                ctx.fillStyle = colors.foreground;
                ctx.shadowColor = colors.shadow;

                const threshold = labelWidth / 2 + this.styles.labelMargin;

                if (x < viewportRange.lower + threshold) {
                    // leftmost
                    x = Math.max(x, viewportRange.lower + threshold);
                    x = Math.min(x, scaledInt.upper - threshold);

                } else if (x > viewportRange.upper - threshold) {
                    // rightmost
                    x = Math.min(x, viewportRange.upper - threshold);
                    x = Math.max(x, scaledInt.lower + threshold);
                }

                ctx.fillText(band.name, x, y);
            }
        });

    }

    renderChromosomeBoundaries() {
        const scale = this.genomeSpy.getZoomedScale();

        const ctx = this.bandLabelCanvas.getContext("2d");
        ctx.strokeStyle = "#909090";
        ctx.setLineDash([3, 3]);

        // TODO: Consider moving to Track base class
        const visibleDomain = Interval.fromArray(scale.domain());

        this.genome.chromMapper.chromosomes().forEach((chrom, i) => {
            if (i > 0 && visibleDomain.contains(chrom.continuousInterval.lower)) {
                const x = scale(chrom.continuousInterval.lower);
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, this.viewportDimensions.height);
                ctx.stroke();
            }
        });
    }


    /**
     * Find a range of cytobands using the search string as a prefix
     */
    search(string) {
        const f = /^[0-9]+$/.test(string) ?
            d => d.chrom.substring(3) == string :
            d => (d.chrom.substring(3) + d.name).startsWith(string);

        const bands = this.mappedCytobands.filter(f);

        if (bands.length > 0) {
            return new Interval(
                Math.min.apply(null, bands.map(b => b.interval.centre() - (b.interval.width()) / 2)),
                Math.max.apply(null, bands.map(b => b.interval.centre() + (b.interval.width()) / 2))
            );
        }
    }

    searchHelp() {
        return `<p>Zoom in to a cytoband, arm or chromosome. Examples:</p>
            <ul>
                <li>8p11.23</li>
                <li>8p11</li>
                <li>8p</li>
                <li>8</li>
            </ul>`;
    }

}


