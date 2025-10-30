module.exports = {
  apps: [
    {
      name: 'wavefunc-web',
      script: 'src/index.tsx',
      interpreter: 'bun',
      cwd: '/var/www/wavefunc',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`
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
      cwd: '/var/www/wavefunc',
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
      interpreter: 'bun',
      cwd: '/var/www/wavefunc',
      env: {
        NODE_ENV: 'production',
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`
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