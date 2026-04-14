FROM node:20
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend ./backend
COPY frontend/dist ./frontend/dist
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/app.js"]
