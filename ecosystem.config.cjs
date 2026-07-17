module.exports = {
  apps: [
    {
      name: 'handdrawn-render-api',
      cwd: '/home/ubuntu/apps/handdrawn-summer-excerpt-video',
      script: 'scripts/render-api.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        HANDDRAWN_API_HOST: '127.0.0.1',
        HANDDRAWN_API_PORT: '3003',
        HANDDRAWN_API_TOKEN: '',
        PUBLIC_DOWNLOAD_ROOT: '/var/www/shudan-assets/handdrawn',
        PUBLIC_DOWNLOAD_BASE_URL: 'http://129.146.22.243:80/assets/handdrawn',
        MAX_CONCURRENT_RENDERS: '1',
      },
    },
  ],
};
