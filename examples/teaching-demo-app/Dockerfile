FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json tsconfig.base.json ./
COPY platform/api/package.json platform/api/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY examples/teaching-demo-app/package.json examples/teaching-demo-app/package.json
RUN npm ci --omit=dev

COPY examples/teaching-demo-app examples/teaching-demo-app
WORKDIR /app/examples/teaching-demo-app

EXPOSE 3001
CMD ["npm", "run", "start"]
