# Production MCP gateway — non-root, minimal attack surface.
# Do not bake secrets into the image. Mount config + data + secrets at runtime.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=7337 \
    MCP_POLICY_PATH=/app/config/policy.yaml \
    MCP_AUDIT_PATH=/data/logs/audit.jsonl \
    MCP_METRICS_PATH=/data/logs/metrics.jsonl \
    MCP_OAUTH_STORE_PATH=/data/oauth-store.json
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 mcp \
  && useradd --uid 10001 --gid mcp --shell /usr/sbin/nologin --create-home mcp \
  && mkdir -p /data/logs /app/config \
  && chown -R mcp:mcp /data /app

COPY --from=build --chown=mcp:mcp /app/package.json /app/package-lock.json ./
COPY --from=build --chown=mcp:mcp /app/node_modules ./node_modules
COPY --from=build --chown=mcp:mcp /app/dist ./dist
COPY --chown=mcp:mcp config ./config

USER mcp
EXPOSE 7337
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MCP_HTTP_PORT||7337)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","dist/index.js"]
