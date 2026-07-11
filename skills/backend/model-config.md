# Model Configuration

Runtime model assignment via `model_config` table (not hardcoded):

| Tier | Default Model | Temperature | Max Tokens |
|---|---|---|---|
| Foundation (1A–1D) | claude-haiku-4-5 | 0.3 | 4096 |
| Specialists (2A–2G, 3A–3D) | claude-sonnet-4-5 | 0.3 | 8192 |
| QA (4X, 4A, 4B, verification) | claude-sonnet-4-5 | 0.0 | 8192 |
| Synthesis (4C) | claude-opus-4-5 | 0.0 | 16384 |

**Swapping models:** Update `model_config` row → next run uses new model. No code change, no redeploy.
