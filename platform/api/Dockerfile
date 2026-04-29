FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json tsconfig.base.json ./
COPY platform/api/package.json platform/api/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY examples/teaching-demo-app/package.json examples/teaching-demo-app/package.json
RUN npm ci --include=dev

FROM deps AS build
COPY platform/api platform/api
COPY packages packages
RUN npm run prisma:generate --workspace @jiaoxue/platform-api
RUN npm run build --workspace @jiaoxue/platform-api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY package.json package-lock.json tsconfig.base.json ./
COPY platform/api/package.json platform/api/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY examples/teaching-demo-app/package.json examples/teaching-demo-app/package.json
RUN npm ci --include=dev

COPY --from=build /app/platform/api/dist platform/api/dist
COPY --from=build /app/platform/api/prisma platform/api/prisma
COPY --from=build /app/node_modules/.prisma node_modules/.prisma

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@jiaoxue/platform-api"]
