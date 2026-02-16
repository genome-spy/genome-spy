# Importing Metadata

!!! note "End-User Documentation"

    This page is intended for users importing metadata during interactive
    analysis.

## Two ways to add metadata

GenomeSpy supports two import workflows:

1. **Upload metadata** for ad hoc files (TSV/CSV and similar tabular data).
2. **Import metadata from source** for preconfigured metadata sources provided
   by the visualization author.

Both workflows add attributes to the metadata panel and are tracked in
provenance, so you can undo or replay them.

## Upload metadata

Use this when your data is in a local file and not preconfigured in the
visualization.

> TODO screenshot: Upload metadata dialog

Typical flow:

1. Open the metadata menu and choose **Upload metadata**.
2. Select your file and confirm delimiter/header settings.
3. Check sample-id matching in the preview step.
4. Finish import.

If sample IDs only partially match, import can still continue for matched
samples.

## Import metadata from source

Use this when the visualization already defines metadata sources (for example,
clinical or expression data).

> TODO screenshot: Import metadata from source menu

Typical flow:

1. Open **Import metadata from source**.
2. Select a source (or open directly if only one source is available).
3. Enter one column id per line in **Columns to import**.
4. Optionally adjust the target metadata group path.
5. Import.

> TODO screenshot: Import metadata from source dialog

Notes:

- Column names are validated before import.
- Unknown column IDs block import and are shown as validation errors.
- If sample-id alignment has caveats, they are shown in the dialog.
- A hard limit of 100 columns is applied per import action.

## Troubleshooting

If import is blocked:

1. Check that sample IDs use the same naming convention as the current sample
   set.
2. Verify column IDs exactly match source columns (including case when
   applicable).
3. Retry with a smaller set of columns.
