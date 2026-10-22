# Convoy Watch API Documentation

Convoy Watch is a secure trip monitoring service.

## Security Configuration

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

## API Access

All API endpoints (except `/health`) require authentication via an `Authorization: Bearer <key>` header or `X-API-Key` header.

### JUDGE_API_KEY (Read-Only)

This key is restricted to read-only endpoints:
- `GET /api/trips`
- `GET /api/trips/:tripId`
- `GET /api/trips/:tripId/reroutes`
- `GET /api/audit-log`

Any attempt to use this key on restricted endpoints (`/api/trips/start`, `approve_action`, etc.) will return a `403 Forbidden` error.

## Audit Log Integrity

Audit logs are cryptographically chained using HMAC-SHA256 with the `AUDIT_HMAC_SECRET`. The `/api/audit-log` endpoint verifies the integrity of the entire chain and will indicate tampering if detected.
