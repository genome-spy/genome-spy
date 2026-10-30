import {
    embed,
    type AppEmbedResult,
    type AppPersistenceContext,
    type AppViewApi,
    type SampleSpec,
} from "@genome-spy/app";

const sampleSpec: SampleSpec = {
    samples: {},
    spec: {
        data: { values: [{ sample: "s1", x: 1 }] },
        mark: "point",
        encoding: {
            sample: { field: "sample" },
            x: { field: "x", type: "quantitative" },
        },
    },
};

// This fixture intentionally loads only the public package entry point.
export async function usePublicAppApi(container: HTMLElement): Promise<void> {
    const api: AppEmbedResult = await embed(
        container,
        { vconcat: [] },
        { embedMode: "embedded" }
    );
    const views: AppViewApi = api.views;
    const parent = views.root();
    let cohort = await views.insert(parent, sampleSpec);
    await views.transaction(async (transaction) => {
        await transaction.remove(cohort);
        cohort = await transaction.insert(parent, sampleSpec);
    });

    await views.remove(cohort);
    const context: AppPersistenceContext = {
        specId: "dataset-b",
        baseUrl: "https://example.org/dataset-b/",
        remoteBookmarks: { url: "bookmarks.json" },
    };
    await api.setPersistenceContext(context);
    await views.insert(parent, sampleSpec);
    await api.setPersistenceContext(null);
    api.finalize();
}
