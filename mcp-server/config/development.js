/**
 * Development Environment Configuration
 *
 * This config is for local development only.
 * Points to localhost API server.
 */

export const CONFIG = {
  environment: 'development',
  apiUrl: 'http://localhost:8080/api',
  webUrl: 'http://localhost:3000',
  settingsUrl: 'http://localhost:3000/settings/api-keys',

  // Environment URLs for reference/docs
  environmentUrls: {
    development: 'http://localhost:8080/api',
    staging: 'https://staging.ezmodo.com/api',
    production: 'https://ezmodo.com/api',
  }
};
