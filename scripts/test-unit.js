const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

assert(pkg.name, 'package.json debe tener campo name');
assert(pkg.scripts, 'package.json debe tener scripts');

const requiredFiles = [
  'server.js',
  'seed.js',
  '.env.example',
  'public',
  'routes',
  'middleware'
];

for (const item of requiredFiles) {
  assert(
    fs.existsSync(path.join(root, item)),
    `Falta archivo o carpeta requerida: ${item}`
  );
}

const requiredDeps = [
  'express',
  'dotenv',
  'jsonwebtoken',
  'sqlite3',
  'bcryptjs'
];

for (const dep of requiredDeps) {
  assert(
    pkg.dependencies && pkg.dependencies[dep],
    `Falta dependencia requerida: ${dep}`
  );
}

console.log('Test unitario básico OK');
