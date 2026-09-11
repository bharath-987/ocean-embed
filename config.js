/**
 * OceanEmbed — Frontend Deployment Configuration
 * ===============================================
 * Automatically sets window.API_BASE_URL based on the runtime environment:
 * - If window.location.hostname is "localhost" or "127.0.0.1", set to "http://localhost:8000".
 * - Otherwise, set to "https://REPLACE_WITH_RENDER_URL.onrender.com".
 */
(function () {
  const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  if (typeof window !== 'undefined') {
    window.API_BASE_URL = isLocal
      ? 'http://localhost:8000'
      : 'https://REPLACE_WITH_RENDER_URL.onrender.com';
  }
})();
