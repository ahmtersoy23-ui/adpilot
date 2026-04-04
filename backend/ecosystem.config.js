module.exports = {
  apps: [{
    name: 'adpilot-backend',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3009,
    },
    error_file: '/var/log/adpilot/error.log',
    out_file: '/var/log/adpilot/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
  }],
};
