# Aerar production image. Full install (not standalone) so the migrate and seed scripts run inside the container.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
# Apply pending migrations, then serve.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
