# Node 22 LTS (Debian slim: sharp funciona sem deps extra do Alpine)
FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies (inclui binários do sharp)
COPY package*.json ./
RUN npm install --omit=dev

# Copy source and build frontend
COPY . .
RUN npm run build

# Create data directory for persistent storage
RUN mkdir -p /app/dados

# Port for the server
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the Node.js server (backend + static frontend)
CMD ["node", "server.js"]
