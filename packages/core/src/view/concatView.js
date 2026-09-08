import {
    isConcatSpec,
    isHConcatSpec,
    isVConcatSpec,
} from "./viewSpecGuards.js";
import GridView from "./gridView/gridView.js";
import ContainerMutationHelper from "./containerMutationHelper.js";
import { getLegendResolutionOwners } from "./gridView/legendCollection.js";
import { moveArrayItem } from "../utils/arrayUtils.js";
import { isLayerSpec, isUnitSpec } from "./viewSpecGuards.js";
import { markViewAsNonAddressable } from "./viewSelectors.js";
import {
    getPrimaryChannel,
    getSecondaryChannel,
    isPositionalChannel,
} from "../encoder/encoder.js";

/**
 * Creates a vertically or horizontally concatenated layout for children.
 *
 * @template {import("../spec/view.js").AnyConcatSpec} [TSpec=import("../spec/view.js").AnyConcatSpec]
 * @extends {GridView<TSpec>}
 */
export default class ConcatView extends GridView {
    /** @type {import("./layerView.js").default | undefined} */
    #annotationLayer;

    /**
     *
     * @param {TSpec} spec
     * @param {import("../types/viewContext.js").default} context
     * @param {import("./containerView.js").default} layoutParent
     * @param {import("./view.js").default} dataParent
     * @param {string} name
     * @param {import("./view.js").ViewOptions} [options]
     */
    constructor(spec, context, layoutParent, dataParent, name, options) {
        super(
            spec,
            context,
            layoutParent,
            dataParent,
            name,
            isConcatSpec(spec)
                ? spec.columns
                : isVConcatSpec(spec)
                  ? 1
                  : Infinity,
            options
        );

        this.spec = spec;
    }

    /**
     * @override
     */
    async initializeChildren() {
        const spec = this.spec;
        const childSpecs = isConcatSpec(spec)
            ? spec.concat
            : isVConcatSpec(spec)
              ? spec.vconcat
              : spec.hconcat;
        /** @type {import("./view.js").ViewOptions} */
        const childOptions = {
            inheritEncoding: true,
        };
        if (this.options.layoutSizeParams == "force") {
            childOptions.layoutSizeParams = "force";
        }

        this.setChildren(
            await Promise.all(
                childSpecs.map((childSpec) =>
                    this.context.createOrImportView(
                        childSpec,
                        this,
                        this,
                        this.getNextAutoName("grid"),
                        undefined,
                        childOptions
                    )
                )
            )
        );

        await this.#initializeAnnotationLayer();

        await this.syncGuideViews();
    }

    /** @override */
    getAnnotationLayer() {
        return this.#annotationLayer;
    }

    async #initializeAnnotationLayer() {
        const channel = isVConcatSpec(this.spec)
            ? "x"
            : isHConcatSpec(this.spec)
              ? "y"
              : undefined;
        const annotationSpecs =
            isVConcatSpec(this.spec) || isHConcatSpec(this.spec)
                ? this.spec.annotate
                : undefined;
        if (!annotationSpecs?.length || !channel) {
            return;
        }

        const perpendicularChannel = channel === "x" ? "y" : "x";
        const layer = {
            layer: annotationSpecs.map((annotation) =>
                prepareAnnotationSpec(
                    structuredClone(annotation),
                    channel,
                    perpendicularChannel
                )
            ),
            resolve: { scale: { [channel]: "forced" } },
        };

        this.#annotationLayer =
            /** @type {import("./layerView.js").default} */ (
                await this.context.createOrImportView(
                    layer,
                    this,
                    this,
                    this.getNextAutoName("annotation"),
                    undefined,
                    {
                        inheritEncoding: false,
                        layoutSizeParams: "inherit",
                    }
                )
            );
        markViewAsNonAddressable(this.#annotationLayer);
    }

    /**
     * Adds a child spec dynamically. Intended for post-initialization updates.
     *
     * Callers should prefer this over direct GridView insertion to ensure
     * dataflow initialization, axis wiring, and layout reflow are handled.
     *
     * @param {import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec} childSpec
     * @param {number} [index]
     * @returns {Promise<import("./view.js").default>}
     */
    async addChildSpec(childSpec, index) {
        return this.#getMutationHelper().addChildSpec(childSpec, index);
    }

    /**
     * Removes a child by index. Intended for post-initialization updates.
     *
     * @param {number} index
     */
    async removeChildAt(index) {
        await this.#getMutationHelper().removeChildAt(index);
    }

    /**
     * Moves a child within the concat container without recreating it.
     *
     * @param {number} fromIndex
     * @param {number} index Destination index after temporarily removing the child.
     * @returns {Promise<void>}
     */
    async moveChildAt(fromIndex, index) {
        const mutationHelper = this.#getMutationHelper();
        const { specs } = this.#getChildSpecs();
        moveArrayItem(specs, fromIndex, index);
        super.moveChildAt(fromIndex, index);
        // Reordering can move shared guide ownership without changing existing
        // child-local guides.
        const guideRoots = await this.#syncMutationGuideViews([]);
        await mutationHelper.initializeUninitializedChromeViews(guideRoots);
        this.context.requestLayoutReflow();
    }

    /**
     * @param {import("../spec/channel.js").Channel} channel
     * @param {import("../spec/view.js").ResolutionTarget} resolutionType
     * @returns {import("../spec/view.js").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        if (resolutionType == "axis") {
            return "independent";
        }

        // Consider a typical uses case: a view that resembles a genome browser with multiple
        // tracks displaying/ genomic or protein coordinates. In these cases, the default
        // resolution for stacked tracks should be "shared".
        // For others, it should be "independent" to provide better compatibility with Vega-Lite.

        if (
            (isVConcatSpec(this.spec) && channel === "x") ||
            (isHConcatSpec(this.spec) && channel === "y")
        ) {
            return "shared";
        } else {
            return "independent";
        }
    }

    /**
     * @returns {{
     *   specs: (import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec)[],
     *   insertAt: (index: number, spec: import("../spec/view.js").ViewSpec | import("../spec/view.js").ImportSpec) => void,
     *   removeAt: (index: number) => void
     * }}
     */
    #getChildSpecs() {
        const spec = this.spec;
        let specs;

        if (isConcatSpec(spec)) {
            specs = spec.concat;
        } else if (isVConcatSpec(spec)) {
            specs = spec.vconcat;
        } else {
            specs = spec.hconcat;
        }

        return {
            specs,
            insertAt: (index, childSpec) => {
                specs.splice(index, 0, childSpec);
            },
            removeAt: (index) => {
                specs.splice(index, 1);
            },
        };
    }

    /**
     * @returns {ContainerMutationHelper}
     */
    #getMutationHelper() {
        /** @type {import("./view.js").ViewOptions} */
        const createViewOptions = {
            inheritEncoding: true,
        };
        if (this.options.layoutSizeParams == "force") {
            createViewOptions.layoutSizeParams = "force";
        }

        return new ContainerMutationHelper(this, {
            getChildSpecs: this.#getChildSpecs.bind(this),
            insertView: (view, index) => this.insertChildViewAt(view, index),
            removeView: (index) => super.removeChildAt(index),
            syncMutationGuideViews: (_view, _index, gridChild) =>
                this.#syncMutationGuideViews(gridChild ? [gridChild] : []),
            defaultName: () => this.getNextAutoName("grid"),
            createViewOptions,
        });
    }

    /**
     * Refreshes this grid and ancestor grid-owned guides. An outer grid may
     * collect legends from a dynamically changed nested composition.
     *
     * @param {import("./gridView/gridChild.js").default[]} gridChildren
     * @returns {Promise<Set<GridView>>}
     */
    async #syncMutationGuideViews(gridChildren) {
        await this.syncGuideViews({
            gridChildren,
            legendOwners: getLegendResolutionOwners(this),
        });
        /** @type {Set<GridView>} */
        const guideRoots = new Set([this]);

        for (const ancestor of this.getDataAncestors()) {
            if (
                Object.values(ancestor.spec.resolve?.legend ?? {}).includes(
                    "collected"
                )
            ) {
                const host = ancestor
                    .getLayoutAncestors()
                    .find((view) => view instanceof GridView);
                if (host && !guideRoots.has(host)) {
                    await host.syncLegendViews();
                    guideRoots.add(host);
                }
            }
        }

        return guideRoots;
    }
}

/**
 * @param {import("../spec/view.js").UnitSpec | import("../spec/view.js").LayerSpec} prepared
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} sharedChannel
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} perpendicularChannel
 * @returns {import("../spec/view.js").UnitSpec | import("../spec/view.js").LayerSpec}
 */
function prepareAnnotationSpec(prepared, sharedChannel, perpendicularChannel) {
    if (!isUnitSpec(prepared) && !isLayerSpec(prepared)) {
        throw new Error(
            "Container annotations accept only unit or layer specifications."
        );
    }

    const resolveScale = prepared.resolve?.scale;
    const sharedResolution =
        resolveScale?.[sharedChannel] ?? resolveScale?.default;
    if (sharedResolution === "independent" || sharedResolution === "excluded") {
        throw new Error(
            `Container annotations cannot use an independent ${sharedChannel} scale.`
        );
    }

    if (
        prepared.scales?.[sharedChannel] !== undefined ||
        prepared.scales?.[perpendicularChannel] !== undefined
    ) {
        throw new Error(
            "Container annotations cannot override positional scale settings."
        );
    }

    if (prepared.encoding) {
        prepareAnnotationEncoding(
            prepared.encoding,
            sharedChannel,
            perpendicularChannel
        );
    }

    if (isLayerSpec(prepared)) {
        prepared.resolve = {
            ...prepared.resolve,
            scale: {
                ...prepared.resolve?.scale,
                [sharedChannel]: "forced",
            },
        };
        prepared.layer = prepared.layer.map((child) =>
            prepareAnnotationSpec(
                /** @type {import("../spec/view.js").UnitSpec | import("../spec/view.js").LayerSpec} */ (
                    child
                ),
                sharedChannel,
                perpendicularChannel
            )
        );
    }

    return prepared;
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} sharedChannel
 * @param {import("../spec/channel.js").PrimaryPositionalChannel} perpendicularChannel
 */
function prepareAnnotationEncoding(
    encoding,
    sharedChannel,
    perpendicularChannel
) {
    for (const [channel, channelDef] of Object.entries(encoding)) {
        if (Array.isArray(channelDef)) {
            continue;
        }

        forEachAnnotationDefinition(
            /** @type {import("../spec/channel.js").ChannelDef} */ (channelDef),
            (definition) => {
                const resolutionChannel = definition.resolutionChannel;
                if (
                    resolutionChannel !== undefined &&
                    isPositionalChannel(getPrimaryChannel(resolutionChannel)) &&
                    getPrimaryChannel(channel) !== sharedChannel
                ) {
                    throw new Error(
                        `Container annotation channel ${channel} cannot resolve through positional channel ${resolutionChannel}.`
                    );
                }
            }
        );
    }

    for (const channel of [sharedChannel, getSecondaryChannel(sharedChannel)]) {
        const channelDef = encoding[channel];
        if (!channelDef) {
            continue;
        }

        forEachAnnotationDefinition(channelDef, (definition) => {
            if (definition.scale !== undefined) {
                throw new Error(
                    `Container annotation encodings on ${channel} cannot define scale settings.`
                );
            }
            if (
                definition.resolutionChannel !== undefined &&
                getPrimaryChannel(definition.resolutionChannel) !==
                    sharedChannel
            ) {
                throw new Error(
                    `Container annotation channel ${channel} must resolve through ${sharedChannel}.`
                );
            }
            if (!("value" in definition)) {
                definition.domainInert = true;
            }
        });
    }

    for (const channel of [
        perpendicularChannel,
        getSecondaryChannel(perpendicularChannel),
    ]) {
        const channelDef = encoding[channel];
        if (!channelDef) {
            continue;
        }

        forEachAnnotationDefinition(channelDef, (definition) => {
            if (!("value" in definition) && definition.scale !== null) {
                throw new Error(
                    `Container annotation encodings on ${channel} must use scale: null.`
                );
            }
        });
    }
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @param {(definition: Record<string, any>) => void} callback
 */
function forEachAnnotationDefinition(channelDef, callback) {
    if (!channelDef || typeof channelDef !== "object") {
        return;
    }

    callback(/** @type {Record<string, any>} */ (channelDef));
    const condition = /** @type {{ condition?: unknown }} */ (channelDef)
        .condition;
    if (condition) {
        for (const definition of Array.isArray(condition)
            ? condition
            : [condition]) {
            if (definition && typeof definition === "object") {
                callback(/** @type {Record<string, any>} */ (definition));
            }
        }
    }
}
