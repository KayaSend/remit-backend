#!/usr/bin/env node

// Simple start script after build fix
try {
  await import('./dist/server.js');
} catch (error) {
  console.error('Error starting server:', error.message);
  process.exit(1);
}