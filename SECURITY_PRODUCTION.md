# Production security

- Nginx redirects HTTP→HTTPS in production, supports TLS 1.2/1.3 and HSTS only on HTTPS listener.
- CAD API, calculations, reports, mesh and metrics are protected. Browser token is exchanged for HttpOnly/SameSite session; token is absent from frontend bundle. CLI uses Bearer.
- Constant-time token comparison, bounded request ID, CORS allowlist, content limits, category-specific rate limits with 429/Retry-After and security headers are enabled.
- Upload filenames are random; storage refs are server-generated and ownership/path traversal checked. Files are outside `public`; cleanup ignores symlinks.
- Optional ClamAV scans before CAD import. Do not mark it operational until container/signature update and safe EICAR test pass. Recommended production mode is fail-closed.
- Runtime is non-root, `no-new-privileges`, cap-drop, read-only root with bounded tmpfs and CPU/memory/pids limits.
- No real tokens, keys, certificate, webhook, production DB or user STEP are included.

Supply-chain commands:

```bash
npm run security:audit
npm run security:sbom
npm run security:licenses
npm run security:secrets
```

Container workflow adds Trivy, OCI labels, image digest, SBOM and provenance. Review HIGH/CRITICAL findings before deployment.
