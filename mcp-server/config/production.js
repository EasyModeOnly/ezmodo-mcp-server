/**
 * Production Environment Configuration
 *
 * This config is baked into the production build at compile time.
 * No runtime environment variables needed (except EZMODO_API_KEY).
 */

export const CONFIG = {
  environment: 'production',
  apiUrl: 'https://ezmodo.com/api',
  webUrl: 'https://ezmodo.com',
  settingsUrl: 'https://ezmodo.com/settings/api-keys',

  // Environment URLs for reference/docs
  environmentUrls: {
    production: 'https://ezmodo.com/api',
  }
};
