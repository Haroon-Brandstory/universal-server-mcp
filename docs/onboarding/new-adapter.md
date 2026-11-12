# New adapter development guide

1. Add capability names to `src/types.ts`
2. Map class in `src/policy/capabilities.ts` (read/write/admin)
3. Register tool in `src/tools/definitions.ts`
4. Implement thin adapter under `src/adapters/<module>/`
5. Gate in `src/gateway.ts` with `requireCap` (+ host/SSRF/project checks)
6. Allow capability on principals in `config/policy.yaml`
7. Optional: `registerModule()` metadata in `src/platform/modules.ts`
8. Tests with mocks/fixtures — no prod systems
9. Docs + ADR if architecture changes

**Do not** re-implement AuthN/AuthZ/audit/approvals inside the adapter.
