FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/*/package.json ./apps/
COPY packages/*/package.json ./packages/
COPY tooling/*/package.json ./tooling/

# Install all dependencies (including workspace dependencies)
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Build the applications
RUN pnpm build

# Set default command
CMD ["pnpm", "start"] 