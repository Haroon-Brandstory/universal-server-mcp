# Production MCP gateway — non-root, minimal attack surface.
# Do not bake secrets into the image. Mount config + data + secrets at runtime.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
# Do NOT set MCP_HTTP_PORT — Render injects PORT and must win.
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_POLICY_PATH=/app/config/policy.yaml \
    MCP_AUDIT_PATH=/data/logs/audit.jsonl \
    MCP_METRICS_PATH=/data/logs/metrics.jsonl \
    MCP_OAUTH_STORE_PATH=/data/oauth-store.json \
    MCP_ALLOW_TUNNEL_HOSTS=1
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini openssh-client \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 mcp \
  && useradd --uid 10001 --gid mcp --shell /usr/sbin/nologin --create-home mcp \
  && mkdir -p /data/logs /data/secrets /app/config \
  && chown -R mcp:mcp /data /app

COPY --from=build --chown=mcp:mcp /app/package.json /app/package-lock.json ./
COPY --from=build --chown=mcp:mcp /app/node_modules ./node_modules
COPY --from=build --chown=mcp:mcp /app/dist ./dist
COPY --chown=mcp:mcp config ./config
COPY --chown=mcp:mcp deploy/docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER mcp
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.MCP_HTTP_PORT||10000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini","--","/app/entrypoint.sh"]
CMD ["node","dist/index.js"]
