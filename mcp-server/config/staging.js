/**
 * Staging Environment Configuration
 *
 * This config is baked into the staging build at compile time.
 * No runtime environment variables needed (except EZMODO_API_KEY).
 */

export const CONFIG = {
  environment: 'staging',
  apiUrl: 'https://staging.ezmodo.com/api',
  webUrl: 'https://staging.ezmodo.com',
  settingsUrl: 'https://staging.ezmodo.com/settings/api-keys',

  // Environment URLs for reference/docs
  environmentUrls: {
    staging: 'https://staging.ezmodo.com/api',
  }
};
