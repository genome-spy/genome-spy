import {
    registerShaderModules, fp64
} from 'luma.gl';
import Track from "./track";

export default class WebGlTrack extends Track {
    constructor() {
        super();
    }

    /**
     * @param {import("../genomeSpy").default} genomeSpy 
     * @param {HTMLElement} trackContainer 
     */
    initialize(genomeSpy, trackContainer) {
        super.initialize(genomeSpy, trackContainer);

        registerShaderModules([fp64], { ignoreMultipleRegistrations: true });
    }


    getDomainUniforms() {
        const domain = this.genomeSpy.getVisibleDomain();

        return {
            uDomainBegin: fp64.fp64ify(domain[0]),
            uDomainWidth: fp64.fp64ify(domain[1] - domain[0])
        };
    }
}