import {
    resizeGLContext, registerShaderModules, fp64
} from 'luma.gl';
import { Matrix4 } from 'math.gl';
import Track from "./track";

export default class WebGlTrack extends Track {
    constructor(genomeSpy, config) {
        super(genomeSpy, config);
    }

    async initialize(trackContainer) {
        await super.initialize(trackContainer);

        registerShaderModules([fp64], { ignoreMultipleRegistrations: true });
    }

    adjustGl(gl) {
        resizeGLContext(gl, { useDevicePixels: true });
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
            uDomainBegin: fp64.fp64ify(domain.lower),
            uDomainWidth: fp64.fp64ify(domain.width())
        };
    }
}