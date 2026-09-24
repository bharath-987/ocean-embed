/**
 * OceanEmbed — Frontend Deployment Configuration
 * ===============================================
 * Automatically sets window.API_BASE_URL based on the runtime environment:
 * - If window.location.hostname is "localhost" or "127.0.0.1", set to "http://localhost:8000".
 * - Otherwise, set to configured Render backend: "https://kyogre-zk7p.onrender.com".
 * - Can be overridden dynamically via window.KYOGRE_API_URL or localStorage 'KYOGRE_API_URL'.
 */
(function () {
  if (typeof window === 'undefined') return;

  const hostname = (window.location && window.location.hostname) || '';
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  // Primary deployed Render backend URL (Single configuration value)
  const PRODUCTION_RENDER_BACKEND = 'https://kyogre-zk7p.onrender.com';

  const customOverride = window.KYOGRE_API_URL || 
    (window.localStorage && window.localStorage.getItem('KYOGRE_API_URL'));

  const resolvedApiBase = customOverride || (isLocal ? 'http://localhost:8000' : PRODUCTION_RENDER_BACKEND);

  window.API_BASE_URL = resolvedApiBase;
  window.BACKEND_URL = resolvedApiBase;
})();

