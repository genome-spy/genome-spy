import { group } from 'd3-array';
import { processData } from '../data/dataMapper';
import Interval from '../utils/interval';
import createEncoders from '../encoder/encoder';

export default class Mark {

    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        this.unitView = unitView;
        this.markConfig = typeof unitView.spec.mark == "object" ? unitView.spec.mark : {};
    }
    
    /**
     * @returns {import("../view/viewUtils").EncodingSpecs}
     */
    getDefaultEncoding() {
        return {
            sample: null
        };
    }

    /**
     * Returns the encoding spec supplemented with mark's default encodings
     * @returns {import("../view/viewUtils").EncodingSpecs}
     */
    getEncoding() {
        const defaults = this.getDefaultEncoding();
        const configured = this.unitView.getEncoding();

        for (const channel in configured) {
            if (typeof defaults[channel] !== "object") {
                throw new Error(`Unsupported channel "${channel}" in ${this.getType()}'s encoding: ${JSON.stringify(configured)}`);
            }
        }
        
        return { ...defaults, ...configured };
    }

    getContext() {
        return this.unitView.context;
    }

    getType() {
        return this.unitView.getMarkType();
    }

    async initializeData() {
        const data = this.unitView.getData();
        if (!data) {
            // TODO: Show view path in error
            throw new Error("Can not initialize mark, no data available!");
        }

        // TODO: Optimize. Now inherited data is ungrouped in all children
        const ungrouped = data.ungroupAll().data;

        const encoding = this.getEncoding();

        if (encoding["sample"]) {
            // TODO: Optimize. Now inherited data is grouped by sample in all children
            const accessor = this.getContext().accessorFactory.createAccessor(encoding["sample"]); 
            /** @type {Map<string, object[]>} */
            this.dataBySample = group(ungrouped, accessor);

        } else {
            this.dataBySample = new Map([["default", ungrouped]]);
        }
    }

    initializeGraphics() {
        const encoding = this.getEncoding();

        /** @type {function(string):function} */
        const scaleSource = channel => {
            const resolution = this.unitView.getResolution(channel);
            if (resolution) {
                return resolution.getScale();
            }
        }

        this.encoders = createEncoders(encoding, scaleSource, this.getContext().accessorFactory);

        this.gl = this.getContext().track.gl; // TODO: FIXME FIXME FIXME FIXME FIXME FIXME 
    }


    onBeforeSampleAnimation() { }

    onAfterSampleAnimation() { }

    /**
     * TODO: Abstract away!
     */
    getYDomain() {
        // TODO: Get rid of the Interval
        return Interval.fromArray(this.unitView.getResolution("y").getScale().domain());
    }

    /**
     * TODO: Abstract away!
     */
    getXDomain() {
        return this.getContext().genomeSpy.getDomain();
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

