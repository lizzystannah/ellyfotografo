# Build Stage (Node 22 LTS: exigido pelas versões atuais do AWS SDK v3)
FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

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
