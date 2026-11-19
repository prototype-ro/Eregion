# Build the standalone server, then run it as a non-root user.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S eregion && adduser -S eregion -G eregion
COPY --from=build --chown=eregion:eregion /app/.next/standalone ./
COPY --from=build --chown=eregion:eregion /app/.next/static ./.next/static
COPY --from=build --chown=eregion:eregion /app/public ./public
USER eregion
# Docker sets HOSTNAME to the container id, and the standalone server listens on HOSTNAME, which would leave it
# unreachable on 127.0.0.1 inside the container.
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
# BACKEND_URL is read when the server starts: where the API runs, for the /api proxy.
CMD ["node", "server.js"]
