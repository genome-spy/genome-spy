// StoreHelper was removed — left a small compatibility shim to produce a
// clear runtime error if any remaining code still imports it. Replace
// callsites with direct usage of the concrete `store` and remove this
// file in a follow-up cleanup.
export default class StoreHelper {
    constructor() {
        throw new Error(
            "StoreHelper has been removed. Use the concrete `store` on App instead."
        );
    }
}
