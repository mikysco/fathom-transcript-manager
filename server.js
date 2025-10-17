require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const TranscriptService = require('./src/services/transcriptService');
const TranscriptRoutes = require('./src/routes/transcripts');
const SyncRoutes = require('./src/routes/sync');

class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    this.transcriptService = null;
    this.autoSyncInterval = null;
    this.isAutoSyncRunning = false;
  }

  async initialize() {
    try {
      // Validate environment variables
      if (!process.env.FATHOM_API_KEY) {
        throw new Error('FATHOM_API_KEY is required');
      }

      // Initialize services
      this.transcriptService = new TranscriptService(
        process.env.FATHOM_API_KEY,
        process.env.DATABASE_URL
      );

      await this.transcriptService.initialize();

      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();

      console.log('Server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize server:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // Trust proxy - Required for Railway and other hosting platforms
    // This allows express-rate-limit to correctly identify users behind proxies
    if (process.env.NODE_ENV === 'production') {
      this.app.set('trust proxy', 1);
    }
    
    // Security middleware
    this.app.use(helmet());
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use(limiter);

    // CORS
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] // Replace with your production domain
        : true,
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Basic Auth middleware (protect everything except health and OPTIONS)
    const basicAuth = (req, res, next) => {
      try {
        // Allow health checks and CORS preflight without auth
        if (req.path === '/health' || req.method === 'OPTIONS') {
          return next();
        }

        const header = req.headers.authorization || '';
        if (!header.startsWith('Basic ')) {
          res.set('WWW-Authenticate', 'Basic realm="Fathom Transcript Manager"');
          return res.status(401).send('Authentication required');
        }

        const base64 = header.split(' ')[1] || '';
        const decoded = Buffer.from(base64, 'base64').toString('utf8');
        const [username, password] = decoded.split(':');

        const isEmail = typeof username === 'string' && username.includes('@');
        const hasValidDomain = isEmail && username.toLowerCase().endsWith('@getcollate.io');
        const isValidPassword = password === 'admin';

        if (hasValidDomain && isValidPassword) {
          return next();
        }

        res.set('WWW-Authenticate', 'Basic realm="Fathom Transcript Manager"');
        return res.status(401).send('Invalid credentials');
      } catch (err) {
        return res.status(401).send('Authentication error');
      }
    };

    this.app.use(basicAuth);

    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // API routes
    this.app.use('/api/transcripts', new TranscriptRoutes(this.transcriptService).getRoutes());
    this.app.use('/api/sync', new SyncRoutes(this.transcriptService).getRoutes());

    // Serve static files from public directory
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Serve the main app for all other routes
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Unhandled error:', error);
      
      res.status(error.status || 500).json({
        success: false,
        error: error.name || 'Internal Server Error',
        message: error.message || 'An unexpected error occurred'
      });
    });
  }

  async start() {
    try {
      await this.initialize();
      
      this.app.listen(this.port, () => {
        console.log(`🚀 Server running on port ${this.port}`);
        console.log(`📊 Health check: http://localhost:${this.port}/health`);
        console.log(`📝 API docs: http://localhost:${this.port}/`);
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🔧 Development mode - API available at http://localhost:${this.port}/api`);
        }

        const runAutoIncrementalSync = async () => {
          if (this.isAutoSyncRunning) {
            console.log('⏸️ Auto-sync already running, skipping this cycle');
            return;
          }
          this.isAutoSyncRunning = true;
          try {
            console.log('⏳ Running incremental sync...');
            await this.transcriptService.syncMeetings({ incremental: true });
            console.log('✅ Incremental sync complete');
          } catch (err) {
            console.error('❌ Incremental sync failed:', err.message);
          } finally {
            this.isAutoSyncRunning = false;
          }
        };

        // Kick off an incremental sync on startup (non-blocking)
        runAutoIncrementalSync();

        // Schedule auto-sync every 2 hours
        const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
        this.autoSyncInterval = setInterval(runAutoIncrementalSync, TWO_HOURS_MS);
        console.log('🕒 Auto-sync scheduled every 2 hours');
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop() {
    try {
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
        console.log('🛑 Auto-sync interval cleared');
      }
      if (this.transcriptService && this.transcriptService.db) {
        await this.transcriptService.db.close();
      }
      console.log('Server stopped gracefully');
    } catch (error) {
      console.error('Error stopping server:', error);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  if (global.server) {
    await global.server.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  if (global.server) {
    await global.server.stop();
  }
  process.exit(0);
});

// Start server
if (require.main === module) {
  const server = new Server();
  global.server = server;
  server.start();
}

module.exports = Server;
