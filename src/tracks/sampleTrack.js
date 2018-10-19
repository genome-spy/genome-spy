import { Matrix4 } from 'math.gl';
import { AnimationLoop, Program, VertexArray, Buffer, setParameters, fp64, createGLContext } from 'luma.gl';

/**
 * A track that displays one or more samples as sub-tracks.
 */
export default class SampleTrack {

    constructor(samples, layers) {
        /*
         * An array of sample objects. Their order stays constant.
         * Properties: id, displayName, data. Data contains arbitrary sample-specific
         * variables, e.g. clinical data.
         */
        this.samples = samples;

        /*
         * A mapping that specifies the order of the samples.
         */
        this.sampleOrder = [];

        this.layers = layers;
    }

    getHeight() {
        return 100;
    };

    /**
     * Returns the minimum width that accommodates the labels on the Y axis.
     * The axis area of sampleTrack contains sample labels and sample-specific
     * variables.
     * 
     * @returns {number} The width
     */
    getMinAxisWidth() {
        return 0;
    }

    initializeGl({spy, gl}) {
        this.layers.forEach(layer => layer.initialize({spy, gl}));
    }

    renderGl({spy, gl, projection}) {

        // TODO: consider d3's scaleBand
        const margin = 10;

        const spacing = 0.25;
        const trackCount = this.samples.length;

        const height = 500; // TODO: fix
        const width = 600; // TODO: fix

        const barHeight = Math.floor(height / trackCount * (1 - spacing));
        const barSpacing = Math.floor(height / trackCount * spacing);

        const domain = spy.getVisibleDomain();

        const globalUniforms = {
            uDomainBegin: fp64.fp64ify(domain[0]),
            uDomainWidth: fp64.fp64ify(domain[1] - domain[0]),
        };

        for (let i = 0; i < this.samples.length; i++) {
            const sample = this.samples[i];
            const sampleId = sample.id;

            const view = new Matrix4()
                .translate([margin, margin + i * (barHeight + barSpacing), 0])
                .scale([width - margin, barHeight, 1]);

            const uniforms = Object.assign({
                uTMatrix: projection.clone().multiplyRight(view),
            }, globalUniforms);

            this.layers.forEach(layer => layer.render(sampleId, gl, uniforms));
        }
    }
}