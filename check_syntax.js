const fs = require('fs');
const path = require('path');
const vm = require('vm');

try {
  const htmlPath = path.join(__dirname, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    console.error('Error: No <script> tag found in index.html');
    process.exit(1);
  }
  
  const jsCode = scriptMatch[1];
  
  // Try to create a Script object, which compiles the code
  new vm.Script(jsCode, { filename: 'index.html [inline JS]' });
  console.log('JavaScript syntax is valid!');
  process.exit(0);
} catch (err) {
  console.error('JavaScript Syntax Error found:\n', err);
  process.exit(1);
}
