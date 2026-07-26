// PM2 process definition. `.cjs` because this repo is `"type": "module"` and PM2's config loader
// expects CommonJS.
module.exports = {
  apps: [
    {
      name: 'cleanify',
      // Explicit cwd so this resolves correctly regardless of which directory `pm2` itself was
      // invoked from — `pm2 restart`/`reload` reuse whatever cwd a process was *first* registered
      // with, they don't re-read this file, so a wrong/implicit cwd here can silently stick around
      // across restarts. Invoking tsx's binary directly (rather than `npm start`) also cuts out an
      // `npm`-spawns-a-shell layer that depends on that same cwd to find node_modules/.bin.
      cwd: __dirname,
      script: './node_modules/.bin/tsx',
      args: 'src/index.ts',
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
