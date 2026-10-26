'use strict';

require('dotenv').config({
  quiet: true,
});

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'bom-trato-api'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  agent_enabled: process.env.NEW_RELIC_ENABLED === 'true',
  allow_all_headers: false,
  distributed_tracing: {
    enabled: true,
  },
  transaction_tracer: {
    record_sql: 'obfuscated',
  },
  error_collector: {
    enabled: true,
    ignore_status_codes: [400, 401, 403, 404, 409, 422, 429],
  },
  strip_exception_messages: {
    enabled: true,
  },
  attributes: {
    exclude: ['request.parameters.*'],
  },
  application_logging: {
    enabled: true,
    metrics: {
      enabled: true,
    },
    forwarding: {
      enabled: true,
      max_samples_stored: 2000,
    },
  },
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || 'info',
    filepath: process.env.NEW_RELIC_LOG || 'stdout',
  },
};
