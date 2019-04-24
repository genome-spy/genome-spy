import * as twgl from 'twgl-base.js';

import { scaleLinear } from 'd3-scale';
import { bisector } from 'd3-array';
import { tsvParseRows } from 'd3-dsv';

import { Matrix4 } from 'math.gl';
import { fp64 } from 'luma.gl';
import TinyQueue from 'tinyqueue';

import WebGlTrack from './webGlTrack';
import Interval from "../utils/interval";
import IntervalCollection from "../utils/intervalCollection";

import geneVertexShader from '../gl/gene.vertex.glsl';
import geneFragmentShader from '../gl/gene.fragment.glsl';
import exonVertexShader from '../gl/exon.vertex.glsl';
import rectangleFragmentShader from '../gl/rectangle.fragment.glsl';


import * as entrez from "../fetchers/entrez";
import * as html from "../utils/html";
import MouseTracker from "../mouseTracker";
import contextMenu from "../contextMenu";


const STREAM_DRAW = 0x88E0;


const defaultConfig = {
    geneFullVisibilityThreshold: 30 * 1000000, // In base pairs
    geneFadeGradientFactor: 2.8,

    maxSymbolsToShow: 70,

    lanes: 3,
    laneHeight: 15, // in pixels
    laneSpacing: 10,
    symbolYOffset: 2,

    fontSize: 11, // in pixels
    fontFamily: "sans-serif"
};


export default class GeneTrack extends WebGlTrack {
    constructor(genomeSpy, config) {
        super(genomeSpy, config);

        this.styles = defaultConfig;

        // TODO: Replace 40 with something sensible
        /** @type {IntervalCollection[]} keeps track of gene symbols on the screen */
        this.symbolsOnLanes = [...Array(40).keys()].map(i => new IntervalCollection(symbol => symbol.screenInterval));

        this.bodyOpacityScale = scaleLinear()
            .range([0, 1])
            .domain([
                this.styles.geneFullVisibilityThreshold * this.styles.geneFadeGradientFactor,
                this.styles.geneFullVisibilityThreshold
            ])
            .clamp(true);

    }

    setGenes(genes) {
        this.genes = genes;

        this.geneClusters = detectGeneClusters(genes);

        // Optimization: use a subset for overview
        // TODO: Use d3.quickselect, maybe add multiple levels, adjust thresholds
        const scoreLimit = this.genes.map(gene => gene.score).sort((a, b) => b - a)[200];
        this.overviewGenes = this.genes.filter(gene => gene.score >= scoreLimit);
    }

    /**
     * @param {HTMLElement} trackContainer 
     */
    async initialize(trackContainer) {
        await super.initialize(trackContainer);

        this.trackContainer.className = "gene-track";
        this.trackContainer.style.height = (this.styles.lanes * (this.styles.laneHeight + this.styles.laneSpacing)) + "px";
        this.trackContainer.style.marginTop = `${this.styles.laneSpacing}px`;

        this.setGenes(parseCompressedRefseqGeneTsv(
            this.genomeSpy.chromMapper,
            await fetch(`private/refSeq_genes_scored.${this.genomeSpy.genome.name}.compressed.txt`).then(res => res.text())));

        this.initializeWebGL();

        this.visibleGenes = [];

        this.visibleClusters = [];

        this.geneBufferInfoMap = new Map();
        this.exonBufferInfoMap = new Map();

        this.symbolWidths = new Map();

        // exonsToVertices only cares about intervals
        //this.clusterVertices = exonsToVertices(this.clusterProgram, this.geneClusters);

        this.symbolCanvas = this.createCanvas();

        this.mouseTracker = new MouseTracker({
            element: this.symbolCanvas,
            resolver: this.findGeneAt.bind(this),
            tooltip: this.genomeSpy.tooltip,
            tooltipConverter: gene => new Promise(resolve => entrez.fetchGeneSummary(gene.symbol)
                .then(summary => resolve(this.entrezSummary2Html(summary)))),
        })
            .on("dblclick", gene => this.genomeSpy.zoomTo(gene.interval.pad(gene.interval.width() * 0.25)))
            .on("contextmenu", (gene, mouseEvent) => contextMenu({ items: createContextMenuItems(gene) }, mouseEvent))

        this.genomeSpy.on("zoom", () => {
            this.render();
        });

        this.genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.render();
        });

        this.genomeSpy.zoom.attachZoomEvents(this.symbolCanvas);
    }

    initializeWebGL() {
        this.glCanvas = this.createCanvas();
        const gl = this.glCanvas.getContext("webgl");
        this.gl = gl;

        gl.clearColor(1, 1, 1, 1);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this.geneProgramInfo = twgl.createProgramInfo(gl, [ geneVertexShader, geneFragmentShader ]);
        this.exonProgramInfo = twgl.createProgramInfo(gl, [ exonVertexShader, rectangleFragmentShader ]);
    }

    entrezSummary2Html(summary) {
        return `
        <div class="gene-track-tooltip">
            <div class="title">
                <strong>${html.escapeHtml(summary.name)}</strong>
                ${html.escapeHtml(summary.description)}
            </div>

            <p class="summary">
                ${html.escapeHtml(summary.summary)}
            </p>

            <div class="source">
                Source: NCBI Gene
            </p>
        </div>`;
    }

    findGeneAt(point) {
        const laneTotal = this.styles.laneHeight + this.styles.laneSpacing;

        // We are interested in symbols, not gene bodies/exons. Adjust y accordingly.
        const y = point[1] - this.styles.laneHeight - this.styles.symbolYOffset;

        const laneNumber = Math.round(y / laneTotal);

        // Include some pixels above and below the symbol
        const margin = 0.3;

        if (laneNumber < 0 || Math.abs(laneNumber * laneTotal - y) > this.styles.fontSize * (1 + margin) / 2) {
            return null;
        }

        const lane = this.symbolsOnLanes[laneNumber];
        const intervalWrapper = lane.intervalAt(point[0]);
        return intervalWrapper ? intervalWrapper.gene : null;
    }

    resizeCanvases(layout) {
        this.adjustCanvas(this.glCanvas, layout.viewport);
        this.adjustCanvas(this.symbolCanvas, layout.viewport);
        this.adjustGl(this.gl);
    }

    updateVisibleClusters() {
        const vi = this.genomeSpy.getViewportDomain();

        const clusters = this.geneClusters.slice(
            bisector(d => d.interval.upper).right(this.geneClusters, vi.lower),
            bisector(d => d.interval.lower).left(this.geneClusters, vi.upper)
        );

        const oldIds = new Set(this.visibleClusters.map(g => g.id));
        const newIds = new Set(clusters.map(g => g.id));

        const entering = clusters.filter(g => !oldIds.has(g.id));
        const exiting = this.visibleClusters.filter(g => !newIds.has(g.id));

        this.visibleClusters = clusters;

        const createBufferInfo = (vertices) =>
            twgl.createBufferInfoFromArrays(
                this.gl,
                vertices.arrays,
                { numElements: vertices.numElements });

        entering.forEach(cluster => {
            this.exonBufferInfoMap.set(
                cluster.id,
                createBufferInfo(exonsToVertices(
                    cluster.genes,
                    this.styles.laneHeight,
                    this.styles.laneSpacing
                )));

            this.geneBufferInfoMap.set(
                cluster.id,
                createBufferInfo(genesToVertices(
                    cluster.genes,
                    this.styles.laneHeight,
                    this.styles.laneSpacing
                )));
        });

        exiting.forEach(cluster => {
            this.exonBufferInfoMap.delete(cluster.id);
            this.geneBufferInfoMap.delete(cluster.id);
        });
    }


    render() {
        const gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT);

        const bodyOpacity =
            this.glCanvas.style.opacity = this.bodyOpacityScale(this.genomeSpy.getViewportDomain().width());

        if (bodyOpacity) {
            this.updateVisibleClusters();
            this.renderGenes();
        }

        this.renderSymbols();
    }

    renderSymbols() {
        this.symbolsOnLanes.forEach(lane => lane.clear());

        const scale = this.genomeSpy.getZoomedScale();
        const visibleInterval = this.genomeSpy.getViewportDomain();

        const genes = visibleInterval.width() < 500000000 ? this.genes : this.overviewGenes;

        const bisec = bisector(gene => gene.interval.lower);

        let visibleGenes = genes
            .slice(
                bisec.right(genes, visibleInterval.lower - 500000),
                bisec.left(genes, visibleInterval.upper + 1000000) // TODO: Visible interval
            ).filter(gene => visibleInterval.connectedWith(gene.interval));

        const priorizer = new TinyQueue(visibleGenes, (a, b) => b.score - a.score);

        const arrowOpacity = this.bodyOpacityScale(this.genomeSpy.getViewportDomain().width());

        const ctx = this.get2d(this.symbolCanvas);
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";

        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = 3;

        ctx.lineJoin = "round";

        const yOffset = this.styles.laneHeight + this.styles.symbolYOffset;

        ctx.clearRect(0, 0, this.symbolCanvas.width, this.symbolCanvas.height);

        let gene;
        let i = 0;
        while (i++ < this.styles.maxSymbolsToShow && (gene = priorizer.pop())) { // TODO: Configurable limit
            const x = scale(gene.interval.centre());

            const text = gene.symbol;

            let width = this.symbolWidths.get(text);
            if (!width) {
                width = ctx.measureText(text).width;
                this.symbolWidths.set(text, width);
            }

            const halfWidth = width / 2 + 5;
            const bounds = new Interval(x - halfWidth, x + halfWidth);
            if (!this.symbolsOnLanes[gene.lane].addIfRoom({ screenInterval: bounds, gene: gene })) {
                continue;
            }

            const y = gene.lane * (this.styles.laneHeight + this.styles.laneSpacing) + yOffset;

            if (arrowOpacity) {
                ctx.globalAlpha = arrowOpacity;

                ctx.font = `${this.styles.fontSize * 0.6}px ${this.styles.fontFamily}`;
                if (gene.strand == '-') {
                    ctx.fillText("\u25c0", x - width / 2 - 4, y);

                } else {
                    ctx.fillText("\u25b6", x + width / 2 + 4, y);
                }

                ctx.globalAlpha = 1;
            }

            ctx.font = `${this.styles.fontSize}px ${this.styles.fontFamily}`;

            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
        }

    }


    renderGenes() {
        const gl = this.gl;

        const uniforms = {
            uMinWidth: 1.0 / gl.drawingBufferWidth, // How many pixels
            uColor: [0, 0, 0],
            ONE: 1.0, // WTF: https://github.com/uber/luma.gl/pull/622
            ...this.getDomainUniforms()
        };

        // TODO: Get rid of the matrix
        const view = new Matrix4()
            .scale([this.gl.canvas.clientWidth, 1, 1]);
        const uTMatrix = this.viewportProjection.clone().multiplyRight(view);

        

        gl.useProgram(this.geneProgramInfo.program);
        twgl.setUniforms(this.geneProgramInfo, {
            ...uniforms,
            uTMatrix,
            uResolution: this.styles.laneHeight
        });

        this.visibleClusters.forEach(cluster => {
            const bufferInfo = this.geneBufferInfoMap.get(cluster.id);
            twgl.setBuffersAndAttributes(gl, this.geneProgramInfo, bufferInfo);
            twgl.drawBufferInfo(gl, bufferInfo);
        });


        gl.useProgram(this.exonProgramInfo.program);
        twgl.setUniforms(this.exonProgramInfo, {
            ...uniforms,
            uTMatrix,
        });

        this.visibleClusters.forEach(cluster => {
            const bufferInfo = this.exonBufferInfoMap.get(cluster.id);
            twgl.setBuffersAndAttributes(gl, this.exonProgramInfo, bufferInfo);
            twgl.drawBufferInfo(gl, bufferInfo);
        });
    }


    search(string) {
        string = string.toUpperCase();

        // TODO: Use array.find (not supported in older browsers)
        const results = this.genes.filter(d => d.symbol == string);
        if (results.length > 0) {
            // Find the longest matching transcript
            results.sort((a, b) => b.interval.width() - a.interval.width());
            const interval = results[0].interval;

            // Add some padding around the gene
            return interval.pad(interval.width() * 0.25);

        } else {
            return null;
        }
    }

    searchHelp() {
        return `<p>Find a gene or transcript. Examples:</p>
        <ul>
            <li>BRCA1</li>
            <li>TP53</li>
        </ul>`;
    }
}



function createExonIntervals(gene) {

    // TODO: Consider doing this in a web worker to prevent transient drop in FPS

    // These implementations should be benchmarked...

    /*
    const geneStart = gene.interval.lower;

    const cumulativeExons = gene.exons.split(",")
        .map(x => parseInt(x, 10))
        .reduce(function (r, c, i) { r.push((r[i - 1] || 0) + c); return r }, []);

    const exons = [];

    // TODO: Use Javascript generators
    for (var i = 0; i < cumulativeExons.length / 2; i++) {
        exons.push(new Interval(
            geneStart + cumulativeExons[i * 2],
            geneStart + cumulativeExons[i * 2 + 1])
        );
    }
    */

    // TODO: Check that gene length equals to cumulative length

    const exons = [];
    const steps = gene.exons.split(",");

    let cumulativePos = gene.interval.lower;

    for (let i = 0; i < steps.length;) {
        cumulativePos += parseInt(steps[i++], 10);
        const lower = cumulativePos;
        cumulativePos += parseInt(steps[i++], 10);
        const upper = cumulativePos;

        exons.push(new Interval(lower, upper));
    }

    return exons;
}


function exonsToVertices(genes, laneHeight, laneSpacing) {

    /* TODO: Consider using flat shading:
     * https://www.khronos.org/opengl/wiki/Type_Qualifier_(GLSL)#Interpolation_qualifiers
     * https://stackoverflow.com/a/40101324/1547896
     * 
     * Gene body and exons could be rendered in one pass by alternating between
     * exons and introns
     */

    const VERTICES_PER_RECTANGLE = 6;

    const exonsOfGenes = genes.map(g => createExonIntervals(g));

    const totalExonCount = exonsOfGenes
        .map(exons => exons.length)
        .reduce((a, b) => a + b, 0);

    const x = new Float32Array(totalExonCount * VERTICES_PER_RECTANGLE * 2);
    const y = new Float32Array(totalExonCount * VERTICES_PER_RECTANGLE);
    const widths = new Float32Array(totalExonCount * VERTICES_PER_RECTANGLE);

    let i = 0;

    genes.forEach((gene, gi) => {
        exonsOfGenes[gi].forEach(exon => {
            const begin = fp64.fp64ify(exon.lower);
            const end = fp64.fp64ify(exon.upper);
            const width = exon.width();

            const top = gene.lane * (laneHeight + laneSpacing);
            const bottom = top + laneHeight;

            x.set([].concat(begin, end, begin, end, begin, end), i * VERTICES_PER_RECTANGLE * 2);
            y.set([bottom, bottom, top, top, top, bottom], i * VERTICES_PER_RECTANGLE);
            widths.set([-width, width, -width, width, -width, width], i * VERTICES_PER_RECTANGLE);

            i++;
        });
    });

    return {
        arrays: {
            x: { data: x, numComponents: 2, drawType: STREAM_DRAW },
            y: { data: y, numComponents: 1, drawType: STREAM_DRAW },
            width: { data: widths, numComponents: 1, drawType: STREAM_DRAW },
        },
        numElements: totalExonCount * VERTICES_PER_RECTANGLE
    };
}


function genesToVertices(genes, laneHeight, laneSpacing) {
    const VERTICES_PER_RECTANGLE = 6;
    const x = new Float32Array(genes.length * VERTICES_PER_RECTANGLE * 2);
    const y = new Float32Array(genes.length * VERTICES_PER_RECTANGLE);
    const yEdge = new Float32Array(genes.length * VERTICES_PER_RECTANGLE);

    genes.forEach((gene, i) => {
        const begin = fp64.fp64ify(gene.interval.lower);
        const end = fp64.fp64ify(gene.interval.upper);

        const top = gene.lane * (laneHeight + laneSpacing);
        const bottom = top + laneHeight;

        const topEdge = 0.0;
        const bottomEdge = 1.0;

        x.set([].concat(begin, end, begin, end, begin, end), i * VERTICES_PER_RECTANGLE * 2);
        y.set([bottom, bottom, top, top, top, bottom], i * VERTICES_PER_RECTANGLE);
        yEdge.set([bottomEdge, bottomEdge, topEdge, topEdge, topEdge, bottomEdge], i * VERTICES_PER_RECTANGLE);
    });

    return {
        arrays: {
            x: { data: x, numComponents: 2, drawType: STREAM_DRAW },
            y: { data: y, numComponents: 1, drawType: STREAM_DRAW },
            yEdge: { data: yEdge, numComponents: 1, drawType: STREAM_DRAW },
        },
        numElements: genes.length * VERTICES_PER_RECTANGLE
    };
}


export function parseCompressedRefseqGeneTsv(cm, geneTsv) {
    const chromNames = new Set(cm.chromosomes().map(chrom => chrom.name));

    let hack = 0; // A hack. Ensure a unique score for each gene.

    const genes = tsvParseRows(geneTsv)
        .filter(row => chromNames.has(row[1]))
        .map(row => {

            const start = parseInt(row[2], 10);
            const end = start + parseInt(row[3], 10);

            hack += 0.0000001;

            return {
                id: row[0],
                symbol: row[0],
                chrom: row[1],
                start: start,
                end: end,
                strand: row[4],
                score: +row[5] + hack,
                exons: row[6],
                // Precalc for optimization
                interval: cm.segmentToContinuous(row[1], start, end),
                lane: undefined
            };
        });


    // Find a free lane for each gene.
    genes.sort((a, b) => a.interval.lower - b.interval.lower);

    const lanes = [];

    const preference = {
        '-': 0,
        '+': 1
    };

    const isOccupied = (laneIdx, pos) => lanes[laneIdx] && lanes[laneIdx] > pos;

    genes.forEach(g => {
        let laneIdx = preference[g.strand];
        if (isOccupied(laneIdx, g.interval.lower)) {
            laneIdx = 0;
            while (laneIdx < 20 && isOccupied(laneIdx, g.interval.lower)) {
                laneIdx++;
            }
        }

        lanes[laneIdx] = g.interval.upper;
        g.lane = laneIdx;
    });

    return genes;
}


function detectGeneClusters(genes) {
    // For overview purposes we create a union of overlapping transcripts
    // and merge adjacent segments that are close enough to each other

    const mergeDistance = 100000;

    let concurrentCount = 0;
    let union = [];
    let leftEdge = null;
    let previousEnd = 0;
    let index = 0;

    let genesInBlock = [];

    genes.map(g => ({ pos: g.interval.lower, start: true, gene: g }))
        .concat(genes.map(g => ({ pos: g.interval.upper, start: false, gene: g })))
        .sort((a, b) => a.pos - b.pos)
        .forEach(edge => {
            if (edge.start) {
                if (concurrentCount == 0) {
                    if (leftEdge == null) {
                        leftEdge = edge.pos;
                    }

                    if (edge.pos - previousEnd > mergeDistance) {
                        union.push({
                            id: index,
                            genes: genesInBlock,
                            interval: new Interval(leftEdge, previousEnd)
                        });

                        genesInBlock = [];
                        leftEdge = edge.pos;
                        index++;
                    }

                }
                genesInBlock.push(edge.gene);
                concurrentCount++;
            }

            if (!edge.start) {
                concurrentCount--;
                previousEnd = edge.pos;
            }

        });

    if (leftEdge) {
        union.push({
            id: index,
            genes: genesInBlock,
            interval: new Interval(leftEdge, previousEnd)
        });
    }

    return union;
}


/**
 * 
 * @param {*} gene 
 * @returns {import("../contextMenu").MenuItem[]}
 */
function createContextMenuItems(gene) {
    const symbol = gene.symbol;

    return [
        {
            label: symbol,
            type: "header"
        },
        {
            type: "divider"
        },
        {
            label: "Search gene symbol in...",
            type: "header"
        },
        {
            label: "NCBI Gene",
            callback: () => window.open(`https://www.ncbi.nlm.nih.gov/gene?cmd=search&term=${symbol}%5Bsym%5D`)
        },
        {
            label: "GeneCards",
            callback: () => window.open(`https://www.genecards.org/Search/Symbol?queryString=${symbol}`)
        },
        {
            label: "OMIM",
            callback: () => window.open(`https://www.omim.org/search/?index=entry&start=1&limit=10&sort=score+desc%2C+prefix_sort+desc&search=approved_gene_symbol%3A${symbol}`)
        },
    ];
}