# Production secrets

Do not commit secret values. Copy `.env.production.example` to `.env.production`, generate tokens with `openssl rand -base64 48`, and restrict the file to the deployment account (`chmod 600`). TLS files belong in `secrets/tls/fullchain.pem` and `secrets/tls/privkey.pem`; obtain them from the real certificate issuer. No self-signed production certificate is included.

For CI/VPS deployment, store the SSH key, host, user and tokens in GitHub Environment secrets. Rotate the access token by updating the environment file during a maintenance window and restarting only `app`; existing sessions become invalid.
