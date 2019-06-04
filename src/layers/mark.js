import { group } from 'd3-array';

export default class Mark {

    /**
     * @param {import("./viewUnit").UnitContext} unitContext
     * @param {import("./viewUnit").default} viewUnit
     */
    constructor(unitContext, viewUnit) {
        this.unitContext = unitContext;
        this.gl = unitContext.sampleTrack.gl;
        this.viewUnit = viewUnit;
        this.markConfig = typeof viewUnit.config.mark == "object" ? viewUnit.config.mark : {};
    }

    async initialize() {
        this._initGL();
    }

    /**
     * @param {object[]} specs
     */
    setSpecs(specs) {
        /** @type {Map<string, object[]>} */
        this.specsBySample = group(specs, d => d.sample);

        // For tooltips
        this.fieldMappers = specs.fieldMappers; 
    }

    onBeforeSampleAnimation() { }

    onAfterSampleAnimation() { }

    _initGL() {

    }

    _getYDomain() {
        const yEncoding = this.viewUnit.getEncoding()["y"];
        const scale = yEncoding.scale;
        if (scale) {
           const domain = scale.domain;
           if (domain) {
               if (Array.isArray(domain) && domain.length == 2) {
                   return domain;
               } else {
                   throw new Error("Invalid domain: " + JSON.stringify(domain));
               }
           }
        }
        
        return [0, 1];
    }

    /**
     * @param {object[]} samples
     * @param {object} globalUniforms 
     */
    render(samples, globalUniforms) {
    }

    /**
     * @param {string} sampleId 
     * @param {number} x position on the range
     * @param {number} y position on the range
     * @param {import("../utils/interval").default} yBand the matched band on the band scale
     */
    findDatum(sampleId, x, y, yBand) {
        return null;
    }
}