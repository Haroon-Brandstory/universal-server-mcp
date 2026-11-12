# Deployment and rollback guide

1. Register deploy project in `config/deployments.yaml`
2. Staging: `deploy.validate` (ciGreen + securityOk) → `deploy.staging`
3. Production: human `deploy_approver` creates approval for **other** requestor + SHA + workflow
4. AI calls `deploy.production.request` with `approvalId`
5. Keep `allow_production_dispatch: false` until explicitly authorized
6. Rollback: `deploy.rollback.plan` → human approval → `deploy.rollback.request`
7. Assess `requires_db_compat` before rolling back DB-backed apps
