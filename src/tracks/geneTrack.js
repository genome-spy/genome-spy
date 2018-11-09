import * as d3 from "d3";
import { Matrix4 } from 'math.gl';
import {
	Program, VertexArray, Buffer, assembleShaders, setParameters, createGLContext,
	resizeGLContext, fp64
} from 'luma.gl';
import WebGlTrack from './webGlTrack';
import Interval from "../utils/interval";

import VERTEX_SHADER from '../gl/exonVertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangleFragment.glsl';


// When does something become visible.
// The values are the width of the visible domain in base pairs
const overviewBreakpoint = 250 * 1000000;
const transcriptBreakpoint = 10 * 1000000; // TODO: Should depend on viewport size

const maxLanes = 7;


export class GeneTrack extends WebGlTrack {
    constructor(genes) {
		super();
		
		this.genes = genes;
    }

    initialize({genomeSpy, trackContainer}) {
        super.initialize({genomeSpy, trackContainer});

        this.trackContainer.className = "gene-track";
		this.trackContainer.style.height = "60px";
		this.trackContainer.style.marginTop = "10px";

		this.glCanvas = this.createCanvas();

        const gl = createGLContext({ canvas: this.glCanvas });
        this.gl = gl;

        setParameters(gl, {
            clearColor: [1, 1, 1, 1],
            clearDepth: [1],
            depthTest: false,
            depthFunc: gl.LEQUAL
		});

        this.exonProgram = new Program(gl, assembleShaders(gl, {
            vs: VERTEX_SHADER,
            fs: FRAGMENT_SHADER,
            modules: ['fp64']
		}));

		this.visibleGenes = [];
		
		this.exonVerticeMap = new Map();

        genomeSpy.on("zoom", () => {
			if (this.getViewportDomain().width() < transcriptBreakpoint) {
				this.updateVisibleGenes();
				this.renderGenes();

			} else {
				// TODO: Only clear if something was visible
				gl.clear(gl.COLOR_BUFFER_BIT);
			}
		});

        genomeSpy.on("layout", layout => {
            this.resizeCanvases(layout);
            this.renderGenes();
        });

        const cm = genomeSpy.chromMapper;
        this.chromosomes = cm.chromosomes();

    }

    resizeCanvases(layout) {
		this.adjustCanvas(this.glCanvas, layout.viewport);

        resizeGLContext(this.gl, { useDevicePixels: false });
		this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);


		// TODO: Maybe could be provided by some sort of abstraction
        this.projection = Object.freeze(new Matrix4().ortho({
            left: 0,
            right: this.gl.drawingBufferWidth,
            bottom: this.gl.drawingBufferHeight,
            top: 0,
            near: 0,
            far: 500
		}));
		
		
		// Precompute matrices for different lanes

		const geneHeight = 15;
		const geneSpacing = 5;

		// Ugh, gimme a range generator!
		this.laneMatrices = [];

		for (var i = 0; i < maxLanes; i++) {
			const view = new Matrix4()
				.translate([0, i * (geneHeight + geneSpacing), 0])
				.scale([this.gl.drawingBufferWidth, geneHeight, 1]);

			this.laneMatrices.push(this.projection.clone().multiplyRight(view));
		}
	}
	
	updateVisibleGenes() {
		// TODO: Should use Intervel Tree here. Let's use a naive binary search kludge for now.
		const bs = d3.bisector(d => d.interval.lower).left;

		// Assume that all genes are shorter than than this
		const maxGeneLength = 3 * 1000000;

		const vi = this.getViewportDomain();

		// TODO: Optimize! Retain id sets, compute revealed and hidden intervals.

		const geneSubset = this.genes.slice(
			bs(this.genes, vi.lower - maxGeneLength),
			bs(this.genes, vi.upper)
		).filter(g => vi.connectedWith(g.interval));

		const oldIds = new Set(this.visibleGenes.map(g => g.id));
		const newIds = new Set(geneSubset.map(g => g.id));

		const entering = geneSubset.filter(g => !oldIds.has(g.id));
		const exiting =  this.visibleGenes.filter(g => !newIds.has(g.id));
		
		this.visibleGenes = geneSubset;

		if (entering.length > 0) {
//			console.log("entering: " + entering.map(g => g.symbol));
			entering.forEach(g => this.exonVerticeMap.set(
				g.id,
				exonsToVertices(
					this.exonProgram,
					createExonIntervals(g).map(i => ({ interval: i }))
				))
			);
		}

		if (exiting.length > 0) {
//			console.log("exiting: " + exiting.map(g => g.symbol));
			exiting.forEach(g => {
				const vertices = this.exonVerticeMap.get(g.id);
				if (vertices) {
					vertices.vertexArray.delete();
					this.exonVerticeMap.delete(g.id);

				} else {
					// TODO: Figure out what's the problem
					console.warn("No vertices found for " + g.id);
				}
			});
		}

		//console.log("Visible genes: " + this.visibleGenes.length);
	}


	renderGenes() {
        const gl = this.gl;

        //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clear(gl.COLOR_BUFFER_BIT);

		const uniforms = Object.assign(
			this.getDomainUniforms(),
			{
				minWidth: 0.5 / gl.drawingBufferWidth, // How many pixels
				ONE: 1.0 // WTF: https://github.com/uber/luma.gl/pull/622
			}
		);


        this.visibleGenes.forEach(gene => {
			if (gene.lane >= maxLanes) return;

			this.exonProgram.draw(Object.assign(
				{
					uniforms: Object.assign(
						uniforms,
						{ uTMatrix: this.laneMatrices[gene.lane] }
					)
				},
				this.exonVerticeMap.get(gene.id)
			));
        });
	}
}



function createExonIntervals(gene) {

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

	// TODO: Check that gene length equals to cumulative length

	return exons;
}

function exonsToVertices(program, exons) {
	// TODO: Could use index buffers here

    const VERTICES_PER_RECTANGLE = 6;
    const x = new Float32Array(exons.length * VERTICES_PER_RECTANGLE * 2);
    const y = new Float32Array(exons.length * VERTICES_PER_RECTANGLE);
    const widths = new Float32Array(exons.length * VERTICES_PER_RECTANGLE);

    exons.forEach((e, i) => {
        const begin = fp64.fp64ify(e.interval.lower);
		const end = fp64.fp64ify(e.interval.upper);
		const width = e.interval.width();

        const topLeft = 0.0;
        const topRight = 0.0;

        const bottomLeft = 1.0;
        const bottomRight = 1.0;

        x.set([].concat(begin, end, begin, end, begin, end), i * VERTICES_PER_RECTANGLE * 2);
        y.set([bottomLeft, bottomRight, topLeft, topRight, topLeft, bottomRight], i * VERTICES_PER_RECTANGLE);
        widths.set([].concat(-width, width, -width, width, -width, width), i * VERTICES_PER_RECTANGLE);
    });

    const gl = program.gl;
    const vertexArray = new VertexArray(gl, { program });

    vertexArray.setAttributes({
        x: new Buffer(gl, { data: x, size: 2, usage: gl.STATIC_DRAW }),
        y: new Buffer(gl, { data: y, size: 1, usage: gl.STATIC_DRAW }),
        width: new Buffer(gl, { data: widths, size: 1, usage: gl.STATIC_DRAW }),
    });

    return {
        vertexArray: vertexArray,
        vertexCount: exons.length * VERTICES_PER_RECTANGLE
    };
}


export function parseCompressedRefseqGeneTsv(cm, geneTsv) {
    const chromNames = new Set(cm.chromosomes().map(chrom => chrom.name));

    const genes = d3.tsvParseRows(geneTsv)
        .filter(row => chromNames.has(row[2]))
        .map(row => {

            const start = parseInt(row[3], 10);
            const end = start + parseInt(row[4], 10);

            return {
                id: row[0],
                symbol: row[1],
                chrom: row[2],
                start: start,
                end: end,
                strand: row[5],
                exons: row[6],
                // Precalc for optimization
                interval: cm.segmentToContinuous(row[2], start, end)
            };
        });

	genes.sort((a, b) => a.interval.lower - b.interval.lower);

	const lanes = [];

	genes.forEach(g => {
		let laneNumber = lanes.findIndex(end => end < g.interval.upper);
		if (laneNumber < 0) {
			laneNumber = lanes.push(0) - 1;
		}
		lanes[laneNumber] = g.interval.upper;
		g.lane = laneNumber;
	});

	// For overview purposes we create a union of overlapping transcripts
	// and merge adjacent segments that are close enough to each other

	const mergeDistance = 75000;

	var concurrentCount = 0;
	genes.union = [];
	var leftEdge = null;
	var previousEnd = 0;
	var index = 0;

	genes.map(g => ({pos: g.interval.lower, start: true}))
		.concat(genes.map(g => ({pos: g.interval.upper, start: false})))
		.sort((a, b) => a.pos - b.pos)
		.forEach(edge => {
			if (edge.start) {
				if (concurrentCount == 0) {
					if (leftEdge == null) {
						leftEdge = edge.pos;
					}

					if (edge.pos - previousEnd > mergeDistance) {
						genes.union.push({ id: index, interval: new Interval(leftEdge, previousEnd) });
						leftEdge = edge.pos;
						index++;
					}

				}
				concurrentCount++;
			}

			if (!edge.start) {
				concurrentCount--;
				previousEnd = edge.pos;
			}

		});

	if (leftEdge) {
		genes.union.push({ id: index, interval: new Interval(leftEdge, previousEnd) });
	}

	return genes;
}
