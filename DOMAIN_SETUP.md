# Domain Setup Guide

## Overview
WaveFunc uses a subdomain architecture for clean separation:
- **Main App**: `wavefunc.live` (with auto HTTPS)
- **Relay**: `relay.wavefunc.live` (WebSocket with auto HTTPS)

## DNS Configuration (Namecheap)

Add these A records in your Namecheap DNS settings:

```
Type: A Record
Host: @
Value: 203.161.49.124
TTL: Automatic

Type: A Record
Host: relay
Value: 203.161.49.124
TTL: Automatic
```

**Note**: DNS propagation can take 5-60 minutes.

## How It Works

### Automatic HTTPS (Caddy)
Caddy automatically provisions SSL certificates from Let's Encrypt:
1. When you visit `wavefunc.live`, Caddy requests a certificate
2. Let's Encrypt verifies domain ownership via HTTP challenge
3. Certificate is issued and auto-renewed every 60 days
4. Both HTTP and HTTPS are supported (HTTP redirects to HTTPS)

### WebSocket Upgrade
- HTTP requests to `wavefunc.live` → Proxied to localhost:3000
- WSS connections to `relay.wavefunc.live` → Proxied to localhost:3334
- Caddy handles the SSL termination and WebSocket upgrade automatically

### Client-Side URL Construction
The frontend automatically constructs the correct relay URL:

**Development** (`localhost:3000`):
- Relay URL: `ws://localhost:3334` (direct connection)

**Production** (`wavefunc.live`):
- Relay URL: `wss://relay.wavefunc.live` (subdomain)
- Protocol: Automatically switches between ws/wss based on page protocol

## Deployment Steps

1. **Update DNS** (if not already done)
   - Add A records as shown above
   - Wait for DNS propagation (~5-60 minutes)

2. **Verify DNS propagation**
   ```bash
   nslookup wavefunc.live
   nslookup relay.wavefunc.live
   ```

3. **Deploy**
   ```bash
   bun run deploy
   ```

4. **Verify deployment**
   - Visit `http://wavefunc.live` (will redirect to HTTPS)
   - Check browser console for: `📡 Relay URL configured: wss://relay.wavefunc.live`
   - Confirm WebSocket connection succeeds

5. **Seed data** (if needed)
   ```bash
   bun run migrate:remote
   ```

## Troubleshooting

### Certificate Provisioning Fails
**Issue**: Caddy can't get SSL certificate

**Fixes**:
1. Ensure DNS is properly propagated
2. Check port 80 and 443 are open on VPS
3. Check Caddy logs: `ssh deploy@203.161.49.124 'sudo journalctl -u caddy -f'`

### WebSocket Connection Fails
**Issue**: Browser shows WebSocket connection error

**Fixes**:
1. Verify relay subdomain resolves: `nslookup relay.wavefunc.live`
2. Check relay is running: `ssh deploy@203.161.49.124 'pm2 status'`
3. Check Caddy config: `ssh deploy@203.161.49.124 'sudo caddy validate --config /etc/caddy/Caddyfile'`

### Mixed Content Warnings
**Issue**: HTTPS page trying to load WS (not WSS) content

**Fix**: The app automatically uses WSS on HTTPS pages. If you see this, check:
```javascript
// In browser console:
console.log(config.relayUrl); // Should be wss://relay.wavefunc.live
```

## Files Changed

- **Caddyfile**: Domain-based routing with automatic HTTPS
- **.env.production**: Updated RELAY_URL to `wss://relay.wavefunc.live`
- **src/config/env.ts**: Subdomain-based relay URL construction
- **package.json**: Updated remote scripts to use new domain

## Environment Variables

### `.env.production` (VPS only)
```bash
RELAY_URL=wss://relay.wavefunc.live
DOMAIN=wavefunc.live
TLS_EMAIL=schlauskwab@proton.me
```

### Build Time
The `RELAY_URL` is injected into the browser bundle at build time, but the runtime URL construction will override it based on the current page URL.

## Security Notes

- ✅ Automatic HTTPS for all traffic
- ✅ WebSocket connections use WSS (encrypted)
- ✅ Let's Encrypt certificates auto-renewed
- ✅ Caddy handles HTTP → HTTPS redirects
- ⚠️ Remember to use strong, unique Nostr keys in production
