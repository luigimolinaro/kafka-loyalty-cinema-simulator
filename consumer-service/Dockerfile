FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY consumer.js ./

# Run the application
CMD ["node", "consumer.js"]
