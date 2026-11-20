FROM node:26-alpine AS web
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=web /app/dist ./dist
COPY server.js ./
VOLUME ["/app/data"]
EXPOSE 8787
CMD ["node", "server.js"]
