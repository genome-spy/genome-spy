import Model, { isLayerSpec, isUnitSpec } from "./model";
import UnitModel from "./unitModel";
import ContainerModel from "./containerModel";

export default class LayerModel extends ContainerModel { 
    /**
     * @param {UnitContext} context
     * @param {ContainerModel} parent
     * @param {string} name 
     * @param {import("./model").Spec} spec
     */
    constructor(context, parent, name, spec) {
        super(context, parent, name, spec)

        // TODO: "subunits" which may be layered or stacked (concatenated) vertically
        this.children = (spec.layer || [])
            .map((childConfig, i) => {
                const name = this.name + "-layer_" + i;
                if (isLayerSpec(childConfig)) {
                    return new LayerModel(context, this, name, childConfig);
                } else if (isUnitSpec(childConfig)) {
                    return new UnitModel(context, this, name, childConfig);
                } else {
                    throw new Error("Invalid spec: " + JSON.stringify(childConfig));
                }
            });
    }

}