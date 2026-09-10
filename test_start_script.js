const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('============================================================');
console.log('  TESTING start.bat SCRIPT INTEGRITY & PATH RESOLUTION');
console.log('============================================================\n');

const startBat = fs.readFileSync('start.bat', 'utf8');

console.log('[TEST 1] Verifying elimination of hardcoded D:\\oceanembed_handoff');
assert(!startBat.includes('D:\\oceanembed_handoff'), 'Hardcoded D:\\oceanembed_handoff must be completely removed');
console.log('  PASS: Hardcoded path eliminated.');

console.log('\n[TEST 2] Verifying relative path based on %~dp0');
assert(startBat.includes('%~dp0backend') || startBat.includes('%BACKEND_DIR%'), 'Must use relative path based on %~dp0');
assert(startBat.includes('cd /d %BACKEND_DIR%') || startBat.includes('cd /d %~dp0backend'), 'Must cd /d to relative directory');
console.log('  PASS: Relative path resolution verified.');

console.log('\n[TEST 3] Verifying backend directory exists relative to project root');
const resolvedBackend = path.join(__dirname, 'backend');
assert(fs.existsSync(resolvedBackend), 'backend folder must exist in project');
assert(fs.existsSync(path.join(resolvedBackend, 'api_server.py')), 'api_server.py must exist in backend folder');
console.log(`  PASS: Found api_server.py in ${resolvedBackend}`);

console.log('\n[TEST 4] Verifying port 8000 binding check');
assert(startBat.includes(':8000') && startBat.includes('LISTENING'), 'start.bat must check port 8000 LISTENING status');
assert(startBat.includes('[ERROR] Backend failed to bind to port 8000!'), 'start.bat must fail loudly if port 8000 binding fails');
assert(startBat.includes(':backend_ready'), 'start.bat must proceed when backend is ready');
console.log('  PASS: Port 8000 binding verification and loud failure logic present.');

console.log('\n[TEST 5] Verifying start.sh fallback');
const startSh = fs.readFileSync('start.sh', 'utf8');
assert(startSh.includes('$SCRIPT_DIR/backend'), 'start.sh must check $SCRIPT_DIR/backend');
console.log('  PASS: start.sh relative path updated.');

console.log('\n============================================================');
console.log('  ALL START SCRIPT VERIFICATION TESTS PASSED (5/5)');
console.log('============================================================');
