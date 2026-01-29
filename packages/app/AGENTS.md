# GenomeSpy App

## Form validation

- Prefer `FormController` + `formField` (from `src/components/forms/`) for new forms.
- Keep validators small (return error string or `null`), use `affects` for dependencies.
- Disable submit via `form.hasErrors()`; validate on submit with `form.validateAll()`.
