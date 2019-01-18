import * as d3 from "d3";
import { Matrix4 } from 'math.gl';
import {
    Program, assembleShaders, registerShaderModules,
    setParameters, createGLContext,
    resizeGLContext, fp64
} from 'luma.gl';
import VERTEX_SHADER from '../gl/rectangleVertex.glsl';
import FRAGMENT_SHADER from '../gl/rectangleFragment.glsl';
import segmentsToVertices from '../gl/segmentsToVertices';
import Interval from "../utils/interval";
import Track from "./track";

export default class WebGlTrack extends Track {
    constructor() {
        super();
    }


    initialize({ genomeSpy, trackContainer }) {
        super.initialize({ genomeSpy, trackContainer });

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