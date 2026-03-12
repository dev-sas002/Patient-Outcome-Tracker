# syntax=docker/dockerfile:1

# ---- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The gateway URL is compiled into the bundle, so it is a build argument rather
# than a runtime variable. docker-compose passes the host-visible gateway port.
ARG VITE_API_BASE_URL=http://localhost:8331
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- runtime ----------------------------------------------------------------
# The unprivileged nginx image listens on 8080 and runs as uid 101, so nothing
# in the serving stage needs root or a capability grant.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
