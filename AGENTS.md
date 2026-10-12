# Repository architecture rules

Read docs/ARCHITECTURE.md before implementation changes.

- Keep web/app.js and root Python commands as thin entry points.
- Keep learning rules in web/src/domain; no DOM, storage, or network dependencies there.
- Keep HTML rendering in web/src/ui/views; no event binding or persistence there.
- Route UI actions through app-controller and persistence through progress-store.
- Put HTTP, export, mapping, and dataset concerns in the corresponding vocab_sync modules.
- Preserve existing progress keys, backup compatibility, and CLI commands unless migration is explicitly required.
- Run relevant domain and integration tests after behavior or architecture changes.
- Never commit credentials, generated personal vocabulary, or local study records.
