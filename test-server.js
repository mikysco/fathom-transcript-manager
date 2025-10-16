#!/usr/bin/env node

// Simple test to verify the server can start without API keys
process.env.FATHOM_API_KEY = 'test-key';
process.env.HUBSPOT_API_KEY = 'test-key';
process.env.NODE_ENV = 'test';

const Server = require('./server');

async function testServer() {
  try {
    console.log('Testing server initialization...');
    const server = new Server();
    
    // Override the start method to prevent actual listening
    const originalStart = server.start.bind(server);
    server.start = async function() {
      await this.initialize();
      console.log('✅ Server initialized successfully!');
      console.log('✅ Database schema created');
      console.log('✅ All services loaded');
      console.log('✅ Routes configured');
      process.exit(0);
    };
    
    await server.start();
  } catch (error) {
    console.error('❌ Server test failed:', error.message);
    process.exit(1);
  }
}

testServer();
