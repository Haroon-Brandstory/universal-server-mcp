# ChatGPT (where MCP supported)

**Status:** protocol only. End-to-end ChatGPT connector verification is **not** claimed in this repo.

When the product supports custom MCP servers:

- Transport: Streamable HTTP `POST/GET /mcp`
- Auth: `Authorization: Bearer <key>` or OAuth if product requires
- Bind remote principal via `oauth.client_principal_map` / least privilege

Do not expose the gateway to the public internet without TLS reverse proxy + tight Host allowlist.
