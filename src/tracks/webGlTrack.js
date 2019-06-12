import { Matrix4 } from 'math.gl';
import { fp64ify } from '../gl/includes/fp64-utils';
import Track from "./track";

export default class WebGlTrack extends Track {
    constructor(genomeSpy, config) {
        super(genomeSpy, config);
    }

    async initialize(trackContainer) {
        await super.initialize(trackContainer);
    }

    adjustGl(gl) {
        gl.canvas.width = gl.canvas.clientWidth * window.devicePixelRatio;
        gl.canvas.height = gl.canvas.clientHeight * window.devicePixelRatio; 

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        this.viewportProjection = Object.freeze(new Matrix4().ortho({
            left: 0,
            right: gl.canvas.clientWidth,
            bottom: gl.canvas.clientHeight,
            top: 0,
            near: 0,
            far: 500
        }));
    }


    getDomainUniforms() {
        const domain = this.genomeSpy.getViewportDomain();

        return {
            uXDomainBegin: fp64ify(domain.lower),
            uXDomainWidth: fp64ify(domain.width())
        };
    }
}