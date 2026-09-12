/**
 * Git Utilities
 * Functions for normalizing git URLs and calculating match confidence
 */

/**
 * Normalize git URL to a standard format for comparison
 * Supports: https://github.com/user/repo.git, git@github.com:user/repo.git, etc.
 * @param {string} url - Git URL to normalize
 * @returns {string|null} - Normalized URL or null if invalid
 */
export function normalizeGitUrl(url) {
  if (!url) return null;

  try {
    let normalized = url.trim().toLowerCase();

    // Remove .git suffix
    normalized = normalized.replace(/\.git$/i, '');

    // Convert git@ format to https://
    // git@github.com:user/repo -> https://github.com/user/repo
    if (normalized.startsWith('git@')) {
      normalized = normalized
        .replace(/^git@/, 'https://')
        .replace(/:([^/])/, '/$1');
    }

    // Remove protocol for comparison
    normalized = normalized
      .replace(/^https?:\/\//, '')
      .replace(/^git:\/\//, '');

    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');

    return normalized;
  } catch {
    return null;
  }
}

/**
 * Calculate match confidence between two git URLs
 * @param {string} repoUrl - Repository URL to compare
 * @param {string} projectUrl - Project URL to compare against
 * @returns {number} - Confidence score between 0 and 1
 */
export function calculateGitMatchConfidence(repoUrl, projectUrl) {
  const repoNorm = normalizeGitUrl(repoUrl);
  const projNorm = normalizeGitUrl(projectUrl);

  if (!repoNorm || !projNorm) return 0;

  // Exact match
  if (repoNorm === projNorm) return 1.0;

  // Same host and path (different protocols)
  if (repoNorm.includes(projNorm) || projNorm.includes(repoNorm)) {
    return 0.95;
  }

  // Extract repo name (last part of path)
  const repoName = repoNorm.split('/').pop();
  const projName = projNorm.split('/').pop();

  // Same repo name
  if (repoName && projName && repoName === projName) {
    return 0.5;
  }

  return 0;
}
