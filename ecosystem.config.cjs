// PM2 process definition. `.cjs` because this repo is `"type": "module"` and PM2's config loader
// expects CommonJS.
module.exports = {
  apps: [
    {
      name: 'cleanify',
      script: 'npm',
      args: 'start',
      // Long polling + the in-process cron loop both live in one process (src/index.ts) and rely
      // on being the only instance — running this in PM2 cluster mode (instances > 1) would mean
      // every instance polls Telegram and runs the cron loop independently, processing the same
      // updates and broadcast/cleanup batches multiple times over.
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // A crash loop shouldn't hammer Telegram/Neon indefinitely.
      max_restarts: 20,
      min_uptime: '30s',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
