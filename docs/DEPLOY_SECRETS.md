# Deploying Secrets

To run Convoy Watch in production, you MUST set the following environment variables (32+ characters each, hex string recommended):

- `API_SECRET_KEY`: Master key for superuser administrative actions.
- `JUDGE_API_KEY`: Read-only key for the automated judge and monitoring agents.
- `AUDIT_HMAC_SECRET`: Secret used to sign and verify the integrity of the audit log.

### Setting Secrets

If deploying to a platform like Cloud Run, set these in the Secrets/Environment Variables tab. Never hardcode these in your repository.

You can generate secure secrets using the provided utility:

```bash
node scripts/generate-secrets.mjs
```
