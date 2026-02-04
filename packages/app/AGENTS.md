# GenomeSpy App

## Architecture reference

- See `APP_ARCHITECTURE.md` for Redux/provenance, async intent processing, and
  bookmark restoration details specific to the app package.

## Style guide

- See `APP_STYLE_GUIDE.md` for dialog, theming, and shared UI styling pointers
  specific to the app package.

## Form validation

- Prefer `FormController` + `formField` (from `src/components/forms/`) for new forms.
- Keep validators small (return error string or `null`), use `affects` for dependencies.
- Disable submit via `form.hasErrors()`; validate on submit with `form.validateAll()`.
