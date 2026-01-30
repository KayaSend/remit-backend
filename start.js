#!/usr/bin/env node

// Debug script to diagnose build failure
import { execSync } from 'child_process';

console.log('🔍 DIAGNOSING BUILD FAILURE');
console.log('Current working directory:', process.cwd());

try {
  console.log('\n📁 Current directory contents:');
  console.log(execSync('ls -la', { encoding: 'utf-8' }));

  console.log('\n📦 Check package.json build script:');
  console.log(execSync('cat package.json | grep -A5 -B5 "build"', { encoding: 'utf-8' }));

  console.log('\n📁 Check if src directory exists:');
  console.log(execSync('ls -la src/ | head -10', { encoding: 'utf-8' }));

  console.log('\n🔧 Check TypeScript compiler:');
  console.log(execSync('npx tsc --version', { encoding: 'utf-8' }));

  console.log('\n📋 Check tsconfig.json:');
  console.log(execSync('cat tsconfig.json', { encoding: 'utf-8' }));

  console.log('\n🔧 Try running tsc directly:');
  console.log(execSync('npx tsc 2>&1', { encoding: 'utf-8' }));

} catch (error) {
  console.error('Command failed:', error.message);
  console.error('stderr:', error.stderr?.toString());
  console.error('stdout:', error.stdout?.toString());
  
  // Try fallback - just run the server directly from src
  console.log('\n🚨 Build failed, trying to run from source:');
  try {
    await import('./src/server.js');
  } catch (srcError) {
    try {
      await import('./server.ts');
    } catch (tsError) {
      console.error('❌ Cannot run from source either');
      process.exit(1);
    }
  }
}