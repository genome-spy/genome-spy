import Collector from "../data/collector";
import createTransform from "../data/transforms/transformFactory";
import createDataSource from "../data/sources/dataSourceFactory";
import UnitView from "./unitView";
import { BEHAVIOR_MODIFIES } from "../data/flowNode";
import CloneTransform from "../data/transforms/clone";
import { isDynamicCallbackData } from "../data/sources/dynamicCallbackSource";
import DataFlow from "../data/dataFlow";
import DataSource from "../data/sources/dataSource";
import {
    isChromPosDef,
    isPositionalChannel,
    primaryChannel
} from "../encoder/encoder";
import LinearizeGenomicCoordinate from "../data/transforms/linearizeGenomicCoordinate";

/**
 * @typedef {import("./view").default} View
 * @typedef {import("../data/flowNode").default} FlowNode
 * @typedef {import("../data/dataFlow").default<View>} DataFlow
 *
 * @param {View} root
 * @param {DataFlow<View>} [existingFlow] Add data flow
 *      graphs to an existing DataFlow object.
 */
export function buildDataFlow(root, existingFlow) {
    /** @type {FlowNode[]} "Current nodes" on the path from view root to the current view */
    const nodeStack = [];

    /** @type {FlowNode} */
    let currentNode;

    /** @type {DataFlow<View>} */
    const dataFlow = existingFlow ?? new DataFlow();

    /**
     * @param {FlowNode} node
     * @param {function():Error} onMissingParent
     */
    function appendNode(node, onMissingParent) {
        if (!currentNode) {
            throw onMissingParent() ||
                new Error("Cannot append data flow node, no parent exist!");
        }
        currentNode.addChild(node);
        currentNode = node;
    }

    /**
     * @param {FlowNode} transform
     * @param {any} [params]
     */
    function appendTransform(transform, params) {
        appendNode(
            transform,
            () =>
                new Error(
                    `Cannot append a transform because no (inherited) data are available! ${
                        params ? JSON.stringify(params) : ""
                    }`
                )
        );
    }

    /**
     *
     * @param {import("../spec/transform").TransformParams[]} transforms
     * @param {View} view
     */
    function createTransforms(transforms, view) {
        for (const params of transforms) {
            /** @type {FlowNode} */
            let transform;
            try {
                transform = createTransform(params, view);
            } catch (e) {
                console.warn(e);
                throw new Error(
                    `Cannot initialize "${params.type}" transform: ${e}`
                );
            }

            if (transform.behavior & BEHAVIOR_MODIFIES) {
                // Make defensive copies before every modifying transform to
                // ensure that modifications don't inadvertently become visible
                // in other branches of the flow.
                // These can be later optimized away where possible.
                appendTransform(new CloneTransform());
            }
            appendTransform(transform);
        }
    }

    /** @param {View} view */
    const processView = view => {
        nodeStack.push(currentNode);

        if (view.spec.data) {
            // TODO: If multiple UrlSources have identical url etc, merge them.

            const dataSource = isDynamicCallbackData(view.spec.data)
                ? view.getDynamicDataSource()
                : createDataSource(view.spec.data, view.getBaseUrl());

            currentNode = dataSource;
            dataFlow.addDataSource(dataSource, view);
        }

        if (view.spec.transform) {
            createTransforms(view.spec.transform, view);
        }

        if (view instanceof UnitView) {
            const collector = new Collector({
                type: "collect",
                groupby: view.getFacetFields()
            });
            appendNode(
                collector,
                () => new Error("A unit view has no (inherited) data source")
            );

            dataFlow.addCollector(collector, view);
        }
    };

    /** @param {View} view */
    processView.afterChildren = view => {
        currentNode = nodeStack.pop();
    };

    root.visit(processView);

    return dataFlow;
}

/**
 * Modifies both the dataflow and view hierarchy by inserting
 * LinearizeGenomicCoordinate transforms to the data flow and replacing the
 * "chrom/pos" in the encoding block with a "field".
 *
 * @param {DataFlow<View>} dataFlow
 */
export function linearizeLocusAccess(dataFlow) {
    for (const [view, collector] of dataFlow._collectorsByHost.entries()) {
        for (const [channel, channelDef] of Object.entries(
            view.getEncoding()
        )) {
            if (isPositionalChannel(channel) && isChromPosDef(channelDef)) {
                /** @param {string} str */
                const strip = str => str.replace(/[^A-Za-z0-9_]/g, "");
                const linearizedField = [
                    "_linearized_",
                    strip(channelDef.chrom),
                    "_",
                    strip(channelDef.pos)
                ].join("");

                collector.insertAsParent(
                    new LinearizeGenomicCoordinate(
                        {
                            type: "linearizeGenomicCoordinate",
                            channel: /** @type {"x" | "y"} */ (primaryChannel(
                                channel
                            )),
                            chrom: channelDef.chrom,
                            pos: channelDef.pos,
                            as: linearizedField
                        },
                        view
                    )
                );

                // Use spec directly because getEncoding() returns inherited props too.
                /** @type {any} */
                const newFieldDef = {
                    ...(view.spec.encoding?.[channel] || {}),
                    field: linearizedField
                };
                delete newFieldDef.chrom;
                delete newFieldDef.pos;
                if (!newFieldDef.type && channelDef.type) {
                    newFieldDef.type = channelDef.type;
                }

                view.spec.encoding[channel] = newFieldDef;
            }
        }
    }
}

/**
 * A helper function for creating linear data flows programmatically.
 *
 * @param {H} dataSource A data source or any other initial FlowNode.
 * @param  {...FlowNode} transforms
 * @template {FlowNode} H
 */
export function createChain(dataSource, ...transforms) {
    /** @type {FlowNode} */
    let node = dataSource;
    for (const transform of transforms) {
        node.addChild(transform);
        node = transform;
    }

    /** @type {Collector} */
    let collector;

    if (node instanceof Collector) {
        collector = node;
    } else {
        collector = new Collector();
        node.addChild(collector);
    }

    /** @type {function():Promise<any[]>} */
    let loadAndCollect;
    if (dataSource instanceof DataSource) {
        loadAndCollect = async () => {
            await dataSource.load();
            return collector.getData();
        };
    } else {
        loadAndCollect = async () => {
            throw new Error("The root node is not derived from DataSource!");
        };
    }

    return {
        dataSource,
        collector,
        loadAndCollect
    };
}
