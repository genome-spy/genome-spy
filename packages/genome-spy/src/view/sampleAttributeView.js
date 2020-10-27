import { field as vegaField, isNumber } from "vega-util";

import { DataGroup } from "../data/group";
import ConcatView from "./concatView";

/**
 * This class takes care of rendering sample labels and metadata.
 *
 * @typedef {import("./view").default} View
 */
export class SampleAttributeView extends ConcatView {
    /**
     * @param {import("./sampleView").default} sampleView
     */
    constructor(sampleView) {
        super(
            { vconcat: [createLabelViewSpec()] },
            sampleView.context,
            sampleView,
            "sampleAttributes"
        );

        this.parent = sampleView;
    }

    getData() {
        // SampleView maintains the sample data
        return new DataGroup("sample attributes", this.parent.sampleData);
    }

    /**
     * @param {View} [whoIsAsking]
     */
    getFacetAccessor(whoIsAsking) {
        // All children display faceted data
        return vegaField("id");
    }

    /**
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     * @param {import("./view").DeferredRenderingRequest[]} [deferBuffer]
     */
    render(coords, options, deferBuffer) {
        // Fugly hack. TODO: Figure out a systematic phase for doing this
        if (!this._labelsUpdated) {
            this.updateData();
            this._labelsUpdated = true;
        }

        for (const sampleLocation of this.parent.getSampleLocations()) {
            super.render(
                coords,
                {
                    ...options,
                    sampleFacetRenderingOptions: {
                        pos: sampleLocation.location.location,
                        height: sampleLocation.location.size
                    },
                    facetId: sampleLocation.sampleId
                },
                deferBuffer
            );
        }
    }
}

/**
 *
 * @param {LocSize[]} locations
 */
function locationsToTextureData(locations) {
    // Create a RG32F texture
    const arr = new Float32Array(locations.length * 2);
    let i = 0;
    for (const location of locations) {
        arr[i++] = location.location;
        arr[i++] = location.size;
    }
    return arr;
}

function createLabelViewSpec() {
    // TODO: Support styling: https://vega.github.io/vega-lite/docs/header.html#labels

    /** @type {import("./viewUtils").UnitSpec} */
    const titleView = {
        name: "sampleLabel",
        mark: {
            type: "text",
            align: "left",
            clip: false
        },
        encoding: {
            x: { value: 0 },
            x2: undefined,
            y: { value: 0.5 },
            text: { field: "displayName", type: "nominal" },
            size: { value: 8 }

            //size: { value: headerConfig.labelFontSize },
            //color: { value: headerConfig.labelColor }
        }
    };

    return titleView;
}
