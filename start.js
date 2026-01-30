#!/usr/bin/env node

// Alternative start script for Render deployment
import { resolve, join } from 'path';
import { existsSync, readdirSync } from 'fs';

console.log(`🚀 Render Deployment Debug Information`);
console.log(`Current working directory: ${process.cwd()}`);
console.log(`Node.js version: ${process.version}`);
console.log(`Platform: ${process.platform}`);

// Try multiple possible locations for the server file
const possiblePaths = [
  resolve('./dist/server.js'),
  resolve('./src/dist/server.js'),
  resolve('../dist/server.js'),
  join(process.cwd(), 'dist', 'server.js'),
  join(process.cwd(), 'src', 'dist', 'server.js')
];

console.log('\n📁 Checking possible server locations:');
let serverPath = null;

for (const path of possiblePaths) {
  const exists = existsSync(path);
  console.log(`${exists ? '✅' : '❌'} ${path}`);
  if (exists && !serverPath) {
    serverPath = path;
  }
}

// List directory contents for debugging
console.log('\n📁 Root directory contents:');
try {
  console.log(readdirSync('.').join(', '));
  
  if (existsSync('./dist')) {
    console.log('\n📁 dist/ directory contents:');
    console.log(readdirSync('./dist').join(', '));
  }
  
  if (existsSync('./src')) {
    console.log('\n📁 src/ directory contents:');
    const srcContents = readdirSync('./src');
    console.log(srcContents.join(', '));
    
    if (srcContents.includes('dist')) {
      console.log('\n📁 src/dist/ directory contents:');
      console.log(readdirSync('./src/dist').join(', '));
    }
  }
} catch (error) {
  console.error('Error listing directory contents:', error);
}

if (!serverPath) {
  console.error('\n❌ Server file not found in any expected location!');
  console.error('Expected locations checked:', possiblePaths);
  process.exit(1);
}

console.log(`\n🎯 Using server file: ${serverPath}`);

// Import and start the server
try {
  await import(serverPath);
} catch (error) {
  console.error('❌ Error starting server:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}