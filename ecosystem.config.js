module.exports = {
  apps: [
    {
      name: 'harmonia-backend',
      script: './backend/src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    },
    {
      name: 'harmonia-frontend',
      script: './frontend/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      }
    }
  ]
};
