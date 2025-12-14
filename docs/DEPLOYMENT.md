# Deployment Guide

This guide covers deploying WaveFunc Radio to a VPS using PM2 and Caddy.

## Prerequisites

### On Your Local Machine
- Bun installed
- Go 1.21+ installed
- SSH access to your VPS

### On Your VPS
- Ubuntu/Debian-based system (recommended)
- Bun installed
- Node.js and PM2 installed globally (PM2 requires Node.js)
- Caddy installed and running
- SSH key authentication configured

## Initial VPS Setup

### 1. Create Deploy User (Optional but Recommended)

For security, create a dedicated non-root user for deployment:

```bash
# SSH into VPS as root
ssh root@your-vps-ip

# Create deploy user
useradd -m -s /bin/bash deploy

# Add to sudo group (for Caddy reload)
usermod -aG sudo deploy

# Set password (you'll be prompted)
passwd deploy

# Switch to deploy user
su - deploy

# Create SSH directory
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add your local public key for SSH access
# On your LOCAL machine, copy your public key:
# cat ~/.ssh/id_rsa.pub
# Then paste it into the authorized_keys file on VPS:
cat > ~/.ssh/authorized_keys << 'EOF'
ssh-rsa YOUR_PUBLIC_KEY_HERE your@email.com
EOF

chmod 600 ~/.ssh/authorized_keys

# Exit back to root
exit

# Configure sudo to allow passwordless Caddy reload (recommended for automated deployments)
# This allows the deploy script to update Caddy config without manual intervention
echo "deploy ALL=(ALL) NOPASSWD: /bin/cp * /etc/caddy/Caddyfile, /bin/systemctl reload caddy" | sudo tee /etc/sudoers.d/deploy-caddy
sudo chmod 0440 /etc/sudoers.d/deploy-caddy
```

**Alternative: Use existing user**

If you prefer to use your existing user (e.g., `ubuntu`, `admin`), skip this step and use that username in your `.env` file.

### 2. Install Required Software

```bash
# Make sure you're logged in as your deploy user (not root)
# If you created the deploy user above, SSH in as that user:
# ssh deploy@your-vps-ip

# Install unzip
sudo apt install unzip

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install Go (required for building the relay)
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
rm go1.21.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# Verify Go installation
go version

# Install Node.js (required for PM2)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally via npm
sudo npm install -g pm2

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### 3. Configure PM2 Startup

```bash
# Setup PM2 to start on boot (run as your regular user, not root)
pm2 startup

# This will output a command to run with sudo, something like:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u YOUR_USER --hp /home/YOUR_USER
# Copy and run that exact command

# After first deployment, save the process list
pm2 save
```

**Note on Bun + PM2:** The ecosystem.config.cjs uses `interpreter: 'bun'` to run TypeScript files directly with Bun. PM2 itself runs on Node.js, but it will execute your Bun scripts correctly.

### 4. Create Deployment Directory

```bash
sudo mkdir -p /var/www/wavefunc
sudo chown -R $USER:$USER /var/www/wavefunc
```

## Environment Configuration

### Local Development

Create `.env` in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Development
NODE_ENV=development
PORT=3000

# VPS Deployment
VPS_HOST=your-vps-ip-or-hostname
VPS_USER=your-username
VPS_PATH=/var/www/wavefunc

# Domain Configuration
DOMAIN=yourdomain.com
TLS_EMAIL=admin@yourdomain.com
```

### Production (VPS)

The `.env.production` file is NOT checked into git. Create it on your local machine:

```bash
# Create .env.production
cat > .env.production << EOF
NODE_ENV=production
PORT=3000
DOMAIN=yourdomain.com
TLS_EMAIL=admin@yourdomain.com

# Relay Configuration
RELAY_URL=wss://yourdomain.com/relay
RELAY_PORT=3334

# ContextVM Metadata Server Keys
# IMPORTANT: Generate new production keys!
# Generate with: bunx nostr-tools generate
METADATA_SERVER_KEY=your-production-server-private-key-64-chars
METADATA_SERVER_PUBKEY=your-production-server-public-key-64-chars

# ContextVM Client Key
# IMPORTANT: Generate new production key!
METADATA_CLIENT_KEY=your-production-client-private-key-64-chars
EOF
```

**IMPORTANT**: The example keys in `.env.example` are for development only. Generate new production keys:

```bash
# Install nostr-tools if not already installed
bunx nostr-tools generate

# This will output a key pair - use these for METADATA_SERVER_KEY and METADATA_SERVER_PUBKEY
# Run again to generate METADATA_CLIENT_KEY
```

This file will be uploaded to the VPS during deployment.

## First-Time Deployment Setup

### Quick Setup (Recommended)

Run these commands on your VPS to prepare for deployment:

```bash
# SSH into your VPS as the deploy user
ssh deploy@your-vps-ip

# Create deployment directory with correct permissions
sudo mkdir -p /var/www/wavefunc
sudo chown -R $USER:$USER /var/www/wavefunc

# Verify it's writable
ls -ld /var/www/wavefunc
# Should show: drwxr-xr-x ... deploy deploy ... /var/www/wavefunc

# Exit VPS
exit
```

### Set Up SSH Keys (Passwordless Access)

From your local machine, copy your SSH key to the VPS:

```bash
# If you don't have an SSH key, generate one first:
ssh-keygen -t rsa -b 4096

# Copy your public key to VPS (you'll enter password one last time)
ssh-copy-id deploy@your-vps-ip

# Test passwordless login
ssh deploy@your-vps-ip
# Should connect without asking for password!
```

### Alternative: Automated Setup Script

You can also try the automated setup script (may prompt for sudo password):

```bash
bun run setup:vps
```

After setup, update your `.env` file with the VPS details.

## Deployment Methods

### Method 1: Local Deployment (Recommended for Testing)

Deploy from your local machine:

```bash
bun run deploy
```

This will:
1. Build the frontend and Go relay locally
2. Create a deployment archive
3. Upload to VPS (passwordless via SSH key)
4. Extract and install dependencies
5. Update Caddy configuration
6. Restart PM2 processes

### Method 2: GitHub Actions (Automatic)

Deployments trigger automatically when you push to `main`. You can also trigger manually.

#### Setup GitHub Secrets

Go to your repository Settings → Secrets and variables → Actions, and add:

**Required Secrets:**
- `VPS_SSH_KEY`: Your private SSH key for VPS access
- `VPS_HOST`: Your VPS hostname or IP
- `VPS_USER`: Your VPS username
- `VPS_PATH`: Deployment path (e.g., `/var/www/wavefunc`)
- `DOMAIN`: Your domain name
- `TLS_EMAIL`: Email for TLS certificates

**Application Secrets (generate new keys for production!):**
- `METADATA_SERVER_KEY`: Private key for ContextVM metadata server (64 hex chars)
- `METADATA_SERVER_PUBKEY`: Public key for ContextVM metadata server (64 hex chars)
- `METADATA_CLIENT_KEY`: Private key for ContextVM client (64 hex chars)

Generate keys using:
```bash
bunx nostr-tools generate
```

#### Manual Trigger

Go to Actions → Deploy to VPS → Run workflow

## Caddy Configuration

The [Caddyfile](./Caddyfile) is managed in the repository and deployed automatically.

To manually update Caddy configuration:

```bash
# Edit Caddyfile locally, then deploy
bun run deploy

# Or manually on VPS
sudo cp /var/www/wavefunc/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### Enable HTTPS

Edit `Caddyfile` and uncomment the TLS line:

```caddyfile
{$DOMAIN:localhost} {
    tls {$TLS_EMAIL}
    # ... rest of config
}
```

## Managing the Application

### View Process Status

```bash
ssh $VPS_USER@$VPS_HOST 'pm2 status'
```

### View Logs

```bash
# All processes
ssh $VPS_USER@$VPS_HOST 'pm2 logs'

# Specific process
ssh $VPS_USER@$VPS_HOST 'pm2 logs wavefunc-web'
ssh $VPS_USER@$VPS_HOST 'pm2 logs wavefunc-relay'
ssh $VPS_USER@$VPS_HOST 'pm2 logs wavefunc-contextvm'
```

### Restart Services

```bash
ssh $VPS_USER@$VPS_HOST 'pm2 restart all'

# Or specific service
ssh $VPS_USER@$VPS_HOST 'pm2 restart wavefunc-web'
```

### Stop Services

```bash
ssh $VPS_USER@$VPS_HOST 'pm2 stop all'
```

## Architecture

The deployment consists of three PM2-managed processes:

1. **wavefunc-web** (port 3000): React frontend served by Bun
2. **wavefunc-relay** (port 3334): Go-based Nostr relay with WebSocket support
3. **wavefunc-contextvm**: ContextVM metadata server

Caddy acts as a reverse proxy, routing:
- `/relay/*` → Relay WebSocket (port 3334)
- All other traffic → Frontend (port 3000)

## Database and Data

SQLite database and search indices are stored in the relay directory:
- `relay/data/relay.db` - Main database
- `relay/data/search_index/` - Bluge full-text search index

These persist across deployments. To reset:

```bash
ssh $VPS_USER@$VPS_HOST 'cd /var/www/wavefunc && pm2 stop wavefunc-relay && rm -rf relay/data && pm2 start wavefunc-relay'
```

## Rollback

To rollback to a previous version:

```bash
# On VPS, use git to rollback
ssh $VPS_USER@$VPS_HOST << EOF
  cd /var/www/wavefunc
  git fetch origin
  git checkout <commit-hash>
  bun install --production
  pm2 restart all
EOF
```

Or redeploy a specific git revision locally:

```bash
git checkout <commit-hash>
bun run deploy
git checkout main
```

## Troubleshooting

### Check if services are running

```bash
ssh $VPS_USER@$VPS_HOST 'pm2 status'
```

### Check Caddy status

```bash
ssh $VPS_USER@$VPS_HOST 'sudo systemctl status caddy'
```

### Check Caddy logs

```bash
ssh $VPS_USER@$VPS_HOST 'sudo journalctl -u caddy -f'
```

### Permission issues

If PM2 can't write logs:

```bash
ssh $VPS_USER@$VPS_HOST 'mkdir -p /var/www/wavefunc/logs && chmod 755 /var/www/wavefunc/logs'
```

### Port conflicts

Ensure ports 3000 and 3334 are not in use:

```bash
ssh $VPS_USER@$VPS_HOST 'lsof -i :3000 && lsof -i :3334'
```

## Testing Locally

You can test the production build locally before deploying:

```bash
# Build for production
bun run build:production

# Start with PM2 locally (modify ecosystem.config.cjs paths first)
pm2 start ecosystem.config.cjs

# View logs
pm2 logs

# Stop when done
pm2 stop all
pm2 delete all
```

## Security Considerations

1. **SSH Keys**: Use key-based authentication, disable password auth
2. **Firewall**: Only open ports 80, 443, and 22
3. **Updates**: Keep the VPS and all packages updated
4. **Secrets**: Never commit `.env` or `.env.production` to git
5. **HTTPS**: Always use TLS in production (enabled in Caddyfile)
6. **User Permissions**: Run services as a non-root user

## Monitoring

Consider setting up monitoring:

```bash
# PM2 monitoring (requires pm2.io account)
pm2 link <secret> <public>

# Or use external monitoring
# - UptimeRobot for uptime monitoring
# - Sentry for error tracking
```