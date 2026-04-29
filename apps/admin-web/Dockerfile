FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json tsconfig.base.json ./
COPY platform/api/package.json platform/api/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY examples/teaching-demo-app/package.json examples/teaching-demo-app/package.json
RUN npm ci

COPY apps/admin-web apps/admin-web
RUN npm run build --workspace @jiaoxue/admin-web

FROM nginx:1.27-alpine
COPY apps/admin-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html
EXPOSE 80
