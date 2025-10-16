# Fathom Transcript Manager

A simple and focused meeting transcript management tool that integrates with Fathom API to organize, search, and analyze customer meeting transcripts.

## Features

- **Simple Search**: Search transcripts by email address, domain, or company name
- **Fathom Integration**: Direct integration with Fathom API (no HubSpot required)
- **Transcript Download**: Download individual or multiple transcripts as text files
- **Clean Interface**: Modern, responsive web interface for easy management
- **Quick Access**: Fast domain-based search with meeting counts

## Prerequisites

- Node.js (v14 or higher)
- Fathom API key
- PostgreSQL database (for production deployment)

## Installation

1. **Clone or download the project**
   ```bash
   cd fathom-transcript-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Edit `.env` file with your Fathom API key:
   ```env
   FATHOM_API_KEY=your_fathom_api_key_here
   FATHOM_BASE_URL=https://api.fathom.ai/external/v1
   PORT=3001
   NODE_ENV=development
   
   # For local development, set up a PostgreSQL database
   # For production on Railway, this will be automatically provided
   DATABASE_URL=postgresql://username:password@localhost:5432/fathom_transcripts
   ```

## Getting Your Fathom API Key

1. Log into your Fathom account
2. Go to Settings → API Access
3. Generate a new API key
4. Copy the key to your `.env` file

## Usage

### Starting the Application

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The application will be available at `http://localhost:3001`

### Using the Interface

#### 1. **Sync Your Data**
- Click the "Sync Data" button to fetch all meetings from Fathom
- This will download and store transcripts locally for fast searching

#### 2. **Search Transcripts**
- **By Email**: Enter a participant's email address
- **By Domain**: Enter a company domain (e.g., `example.com`)
- **By Company**: Enter a company name (searches in meeting titles and participant info)

#### 3. **Download Transcripts**
- Select individual transcripts using checkboxes
- Click "Select All" to select all results
- Click "Download Selected" to get a concatenated text file

#### 4. **Quick Domain Access**
- The interface shows your most active domains with meeting counts
- Click any domain button for instant search

## API Endpoints

### Search
- `GET /api/transcripts/search/email/:email` - Search by email address
- `GET /api/transcripts/search/domain/:domain` - Search by domain
- `GET /api/transcripts/search/company/:company` - Search by company name
- `GET /api/transcripts/domains` - Get all domains with meeting counts
- `GET /api/transcripts/:id` - Get specific transcript

### Download
- `POST /api/transcripts/concatenate` - Concatenate selected transcripts

### Sync
- `POST /api/sync/meetings` - Sync meetings from Fathom
- `GET /api/sync/status` - Get sync status
- `GET /api/sync/test-fathom` - Test Fathom API connectivity

### Health
- `GET /health` - Health check endpoint

## Database Schema

The application uses SQLite with a simple schema:

- **meetings**: Stores Fathom meeting data and transcripts
- **meeting_participants**: Stores meeting participant details

## Configuration

### Environment Variables

```env
# Fathom API Configuration
FATHOM_API_KEY=your_fathom_api_key_here
FATHOM_BASE_URL=https://api.fathom.ai/v1

# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DB_PATH=./data/transcripts.db
```

### Rate Limiting
- Default: 100 requests per 15 minutes per IP
- Adjust in `server.js` if needed

## Monitoring API Calls

### How to Verify Fathom API Connectivity

#### 1. **Quick API Test**
```bash
# Test Fathom API connectivity via endpoint
curl http://localhost:3001/api/sync/test-fathom
```

#### 2. **Standalone Test Script**
```bash
# Run the dedicated test script
node test-fathom-api.js
```

#### 3. **Check Sync Status**
```bash
# View current sync status
curl http://localhost:3001/api/sync/status
```

#### 4. **Monitor Console Logs**
When running the server, watch for these success indicators:
- `✅ Fathom API call successful: GET /meetings (Status: 200, Count: X)`
- `Fetched X meetings so far...`
- `Total meetings fetched: X`

#### 5. **Error Indicators**
Look for these error patterns:
- `❌ Error fetching meetings from Fathom: [error details]`
- HTTP status codes other than 200
- Network timeout or connection errors

## Troubleshooting

### Common Issues

1. **API Key Errors**
   - Verify your Fathom API key is correct
   - Check that the key has proper permissions

2. **Sync Failures**
   - Check network connectivity
   - Verify API quotas haven't been exceeded
   - Check server logs for detailed error messages

3. **Database Issues**
   - Ensure the `data` directory is writable
   - Delete `data/transcripts.db` to reset the database

4. **Port Conflicts**
   - Change the PORT in `.env` if 3001 is already in use

### Logs
Check the console output for detailed error messages and sync progress.

## Development

### Project Structure
```
fathom-transcript-manager/
├── src/
│   ├── models/
│   │   └── database.js          # Database schema and connection
│   ├── services/
│   │   ├── fathomService.js     # Fathom API integration
│   │   └── transcriptService.js # Business logic
│   └── routes/
│       ├── transcripts.js       # Transcript API routes
│       └── sync.js             # Sync API routes
├── public/
│   └── index.html              # Web interface
├── data/                       # SQLite database storage
├── server.js                   # Main server file
└── package.json
```

### Adding Features
- Extend services in `src/services/`
- Add new routes in `src/routes/`
- Modify the web interface in `public/index.html`

## Deployment to Railway

### Quick Deploy

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add Railway deployment configuration"
   git push origin main
   ```

2. **Deploy on Railway**
   - Go to [Railway.app](https://railway.app)
   - Sign up/login with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway will automatically detect it's a Node.js app

3. **Add PostgreSQL Database**
   - In your Railway project, click "New" → "Database" → "PostgreSQL"
   - Railway will automatically provide the `DATABASE_URL` environment variable

4. **Configure Environment Variables**
   - In Railway dashboard, go to "Variables" tab
   - Add your Fathom API key:
     ```
     FATHOM_API_KEY=your_fathom_api_key_here
     FATHOM_BASE_URL=https://api.fathom.ai/external/v1
     NODE_ENV=production
     ```

5. **Deploy**
   - Railway will automatically deploy your app
   - Your app will be available at a Railway-provided URL
   - Share this URL with your teammates!

### Custom Domain (Optional)
- In Railway dashboard, go to "Settings" → "Domains"
- Add your custom domain
- Railway provides SSL certificates automatically

## Security Considerations

- API keys are stored in environment variables
- Rate limiting prevents abuse
- Helmet.js provides security headers
- CORS is configured for production use
- PostgreSQL provides secure data storage

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review server logs for error details
3. Verify API key permissions and quotas
4. Test API connectivity using the provided tools