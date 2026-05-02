# ---- Stage 1: Build do frontend ----
FROM node:20 AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

# ---- Stage 2: Backend em produção ----
FROM node:20
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend ./backend
COPY --from=frontend /app/frontend/dist ./frontend/dist
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/app.js"]
