FROM node:lts-alpine

# Install serve for local serving
RUN npm install -g serve

# Set the working directory
WORKDIR /app

# Pass the environment variable during build process
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the app for production
RUN npm run build

# Expose port
EXPOSE 8080

# Serve the app using serve on port 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
