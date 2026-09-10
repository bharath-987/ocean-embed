const fs = require('fs');
const path = require('path');
const assert = require('assert');

const styleCss = fs.readFileSync('style.css', 'utf8');
const appJs = fs.readFileSync('app.js', 'utf8');

console.log('[TEST 1] Base .cast-error-msg styling');
assert(styleCss.includes('.cast-error-msg {'));
assert(/display:\s*flex;/.test(styleCss));
assert(/flex-direction:\s*column;/.test(styleCss));
assert(/align-items:\s*center;/.test(styleCss));
assert(/text-align:\s*center;/.test(styleCss));
assert(/background:\s*#FEF2F2;/.test(styleCss));
assert(/border:\s*1px solid #FECACA;/.test(styleCss));
assert(/border-radius:\s*14px;/.test(styleCss));
assert(/padding:\s*18px 20px;/.test(styleCss));
console.log('  PASS');

console.log('[TEST 2] Warning icon (emoji)');
assert(styleCss.includes('.cast-error-msg::before'));
assert(styleCss.includes('content: "⚠️"'));
console.log('  PASS');

console.log('[TEST 3] Text hierarchy (15px bold title, 13px regular body)');
assert(styleCss.includes('.cast-error-msg strong'));
assert(/font-size:\s*15px;/.test(styleCss));
assert(/font-weight:\s*700;/.test(styleCss));
assert(styleCss.includes('.cast-error-msg span'));
assert(/font-size:\s*13px\s*!important;/.test(styleCss));
assert(/font-weight:\s*400;/.test(styleCss));
assert(/line-height:\s*1\.55;/.test(styleCss));
console.log('  PASS');

console.log('[TEST 4] Inline code URL styling');
assert(styleCss.includes('.cast-error-msg code'));
assert(/font-family:\s*[^;]*monospace/.test(styleCss));
assert(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.05\);/.test(styleCss));
assert(/border-radius:\s*4px;/.test(styleCss));
assert(/text-decoration:\s*none;/.test(styleCss));
const codeBlock = styleCss.match(/\.cast-error-msg code[\s\S]*?\}/)[0];
assert(!/color:\s*#2563EB/.test(codeBlock));
console.log('  PASS');

console.log('[TEST 5] .ky-tvd-idle layout & state isolation');
assert(styleCss.includes('.ky-tvd-idle {'));
assert(styleCss.includes('.ky-tvd-idle:has(.cast-error-msg)'));
console.log('  PASS');

console.log('[TEST 6] app.js code wrapping');
assert(appJs.includes('<code>${API_BASE}</code>'));
console.log('  PASS');

console.log('\n========================================');
console.log('  ALL ERROR COMPONENT CHECKS PASSED!');
console.log('========================================');
