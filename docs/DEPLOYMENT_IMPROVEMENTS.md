# Deployment Script Improvements

## Summary of Changes

We've significantly simplified and improved the deployment infrastructure for better maintainability.

## Key Improvements

### 1. **Separation of Concerns**
- **Before**: Single monolithic 155-line `deploy.sh` with embedded SSH heredoc
- **After**: Split into two focused scripts:
  - `scripts/deploy.sh` (58 lines) - Local orchestration
  - `scripts/deploy-remote.sh` (46 lines) - VPS execution logic

**Benefits:**
- Easier to test remote deployment logic independently
- Better readability and debugging
- Can run `deploy-remote.sh` manually on VPS if needed

### 2. **Proper Use of Ecosystem Config**
- **Before**: PM2 ecosystem config existed but was bypassed; individual `pm2 start` commands with many flags
- **After**: Single `pm2 start ecosystem.config.cjs` command

**Benefits:**
- Single source of truth for PM2 configuration
- Environment variables properly loaded from `.env` file
- Reduced duplication (commonSettings object)
- Easier to add new services

### 3. **Cleaner GitHub Actions Workflow**
- **Before**: 100+ line embedded bash script in YAML
- **After**: Reuses `deploy-remote.sh` script

**Benefits:**
- Same deployment logic for manual and automated deploys
- Easier to maintain (one script to update)
- GitHub Actions focuses on CI/CD orchestration, not deployment details

### 4. **Better Error Handling**
- Explicit dependency checks (Bun, Go)
- Clearer error messages
- Graceful degradation (Caddy reload is optional)

## File Structure

```
scripts/
├── build-production.sh   # Build frontend assets
├── deploy.sh            # Main deployment script (local)
└── deploy-remote.sh     # Remote deployment logic (runs on VPS)

ecosystem.config.cjs     # PM2 process configuration
.env                     # Local deployment config (VPS_HOST, etc.)
.env.production          # Production secrets (on VPS only, not in git)
```

## Deployment Flow

### Manual Deployment
```bash
bun run deploy
```

1. Loads `.env` for VPS connection info
2. Builds frontend locally → `dist/`
3. Creates `deploy.tar.gz` archive
4. Uploads archive + `.env.production` + `deploy-remote.sh` to VPS
5. Executes `deploy-remote.sh` on VPS via SSH
6. VPS script extracts files, builds relay, restarts PM2

### GitHub Actions Deployment
1. Triggered on push to `main` branch
2. Builds frontend in CI
3. Creates `.env.production` from GitHub Secrets
4. Uploads files to VPS
5. Executes same `deploy-remote.sh` script

## Lines of Code Reduction

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `deploy.sh` | 155 lines | 58 lines | **-63%** |
| `deploy-remote.sh` | (embedded) | 46 lines | (new) |
| `ecosystem.config.cjs` | 60 lines | 60 lines | (cleaner) |
| GitHub Actions | ~100 lines bash | ~40 lines | **-60%** |

**Total:** ~230 lines → ~150 lines (-35% overall, much more maintainable)

## Remaining Issues to Address

1. **Environment Variable Management**
   - Relay URL hardcoded to `ws://localhost:3334` in client
   - Need to use `RELAY_URL` from environment
   - Should work on both VPS (wss://domain/relay) and local (ws://localhost:3334)

2. **Documentation**
   - Update `DEPLOYMENT.md` with new simpler flow
   - Document `.env` vs `.env.production` distinction

## Next Steps

1. Fix relay URL to use environment variable
2. Test deployment end-to-end
3. Update DEPLOYMENT.md
4. Consider adding rollback script
