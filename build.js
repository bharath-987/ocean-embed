const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  outfile: 'dist/kyogre-app.js',
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  format: 'iife',
  globalName: 'KyogreApp',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  banner: {
    js: 'var require = function(m) { if (m==="react") return window.React; if (m==="react-dom/client"||m==="react-dom") return window.ReactDOM; if (m==="react/jsx-runtime") return { jsx: window.React.createElement, jsxs: window.React.createElement, Fragment: window.React.Fragment }; throw new Error("Cannot find module " + m); };',
  },
}).then(() => {
  console.log('✅ Kyogre bundle build completed successfully with NODE_ENV=production!');
}).catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
