# Form Patterns

- Query type selection: toggle buttons with visual highlight (indigo border + bg)
- Multi-select uses state array; "full" selection clears others
- Agent preview: computed from `DOMAIN_AGENTS` map — shows user which agents will run
- Submission: POST to API, receive 202 + `runId`, redirect to progress page
- Error display: red box below form, cleared on next submit
