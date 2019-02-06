import * as d3 from "d3";
import { Matrix4 } from 'math.gl';
import {
    Program, assembleShaders, setParameters, createGLContext
} from 'luma.gl';
import VERTEX_SHADER from '../gl/rectangleVertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangleFragment.glsl';
import segmentsToVertices from '../gl/segmentsToVertices';
import Interval from "../utils/interval";
import WebGlTrack from "./webGlTrack";


const giemsaScale = d3.scaleOrdinal()
    .domain([
        "gneg", "gpos25", "gpos50", "gpos75", "gpos100", "acen", "stalk", "gvar"
    ]).range([
        "#f0f0f0", "#e0e0e0", "#d0d0d0", "#c0c0c0", "#a0a0a0", "#cc4444", "#338833", "#000000"
    ].map(str => ({
        background: d3.color(str),
        foreground: d3.color(d3.hsl(str).l < 0.5 ? "#ddd" : "black"),
        shadow: d3.color(d3.hsl(str).l < 0.5 ? "transparent" : "rgba(255, 255, 255, 0.25)")
    })));


const defaultConfig = {
    fontSize: 11,
    fontFamily: "sans-serif",

    labelMargin: 3
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
    constructor() {
        super();

        this.config = defaultConfig;
    }

    /**
     * @param {import("../genomeSpy").default} genomeSpy 
     * @param {HTMLElement} trackContainer 
     */
    initialize(genomeSpy, trackContainer) {
        super.initialize(genomeSpy, trackContainer);

        // TODO: Check cytobands' presence in Genome

        this.mappedCytobands = mapUcscCytobands(genomeSpy.chromMapper, genomeSpy.genome.cytobands);

        this.trackContainer.className = "cytoband-track";
        this.trackContainer.style.height = "21px";

        this.glCanvas = this.createCanvas();
        const gl = createGLContext({ canvas: this.glCanvas });
        this.gl = gl;

        setParameters(gl, {
            clearColor: [1, 1, 1, 1],
            clearDepth: [1],
            depthTest: false,
            depthFunc: gl.LEQUAL
        });

        this.bandProgram = new Program(gl, assembleShaders(gl, {
            vs: VERTEX_SHADER,
            fs: FRAGMENT_SHADER,
            modules: ['fp64']
        }));

        this.bandVertices = segmentsToVertices(
            this.bandProgram,
            this.mappedCytobands.map(band => Object.assign(
                {
                    interval: band.interval,
                    colorTop: giemsaScale(band.gieStain).background.brighter(0.1),
                    colorBottom: giemsaScale(band.gieStain).background.darker(0.3),
                },
                computePaddings(band)
            ))
        );


        // TODO: Create textures for labels and render everything with WebGL
        this.bandLabelCanvas = this.createCanvas();

        const ctx = this.get2d(this.bandLabelCanvas);
        ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
        this._bandLabelWidths = this.mappedCytobands.map(band => ctx.measureText(band.name).width);


        genomeSpy.on("zoom", () => {
            this.render();
        });

        genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.render();
        });

        genomeSpy.zoom.attachZoomEvents(this.bandLabelCanvas);
    }

    resizeCanvases(layout) {
        this.adjustCanvas(this.bandLabelCanvas, layout.viewport);
        this.adjustCanvas(this.glCanvas, layout.viewport);
        this.adjustGl(this.gl);
    }


    render() {
        this.renderBands();
        this.renderLabels();
        this.renderChromosomeBoundaries();
    }

    renderBands() {
        const gl = this.gl;

        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // TODO: Move to base class / abstraction
        const uniforms = Object.assign(
            {
                yPos: [0, 1]
            },
            this.getDomainUniforms()
        );

        this.bandProgram.draw(Object.assign(
            {
                uniforms: Object.assign({ ONE: 1.0 }, uniforms) // WTF: https://github.com/uber/luma.gl/pull/622
            },
            this.bandVertices
        ));
    }

    renderLabels() {
        const scale = this.genomeSpy.getZoomedScale();
        const viewportInterval = Interval.fromArray(scale.range()); // TODO: Provide this from somewhere
        const ctx = this.get2d(this.bandLabelCanvas);
        ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";

        const r = window.devicePixelRatio || 1;
        ctx.shadowOffsetY = 1.0 * r;

        ctx.clearRect(0, 0, this.bandLabelCanvas.clientWidth, this.bandLabelCanvas.clientHeight);

        const y = this.bandLabelCanvas.clientHeight / 2;

        // TODO: For each band, precompute the maximum domain width that yields bandwidth ...
        // ... that accommodates the label. That would avoid scaling intervals of all bands.

        this.mappedCytobands.forEach((band, i) => {
            const scaledInt = band.interval.transform(scale);
            const labelWidth = this._bandLabelWidths[i];

            if (scaledInt.connectedWith(viewportInterval) &&
                scaledInt.width() > labelWidth + this.config.labelMargin * 2) {
                let x = scaledInt.centre();

                const colors = giemsaScale(band.gieStain);
                ctx.fillStyle = colors.foreground;
                ctx.shadowColor = colors.shadow;

                const threshold = labelWidth / 2 + this.config.labelMargin;

                if (x < viewportInterval.lower + threshold) {
                    // leftmost
                    x = Math.max(x, viewportInterval.lower + threshold);
                    x = Math.min(x, scaledInt.upper - threshold);

                } else if (x > viewportInterval.upper - threshold) {
                    // rightmost
                    x = Math.min(x, viewportInterval.upper - threshold);
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

        this.genomeSpy.chromMapper.chromosomes().forEach((chrom, i) => {
            if (i > 0 && visibleDomain.contains(chrom.continuousInterval.lower)) {
                const x = scale(chrom.continuousInterval.lower);
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, this.bandLabelCanvas.height);
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


