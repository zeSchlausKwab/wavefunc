// PM2 requires absolute path to Bun executable
// On VPS this will be ~/.bun/bin/bun, locally it might be different
const os = require('os');
const path = require('path');
const bunPath = process.env.BUN_INSTALL
  ? path.join(process.env.BUN_INSTALL, 'bin', 'bun')
  : path.join(os.homedir(), '.bun', 'bin', 'bun');

module.exports = {
  apps: [
    {
      name: 'wavefunc-web',
      script: 'src/index.tsx',
      interpreter: bunPath,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'wavefunc-relay',
      script: './relay/relay',
      env: {
        PORT: 3334
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/relay-error.log',
      out_file: './logs/relay-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'wavefunc-contextvm',
      script: 'contextvm/server.ts',
      interpreter: bunPath,
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/contextvm-error.log',
      out_file: './logs/contextvm-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};