const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

// Structured logger.
// - Production: newline-delimited JSON to stdout (optimal for log shippers
//   like Loki/Datadog/CloudWatch and `docker logs`).
// - Development: human-readable, colorized output via pino-pretty.
const logger = pino({
  level,
  redact: {
    // Never let secrets leak into logs.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      '*.password',
      '*.token',
      'JWT_SECRET',
      'DATABASE_URL',
    ],
    censor: '[REDACTED]',
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }),
});

module.exports = logger;
