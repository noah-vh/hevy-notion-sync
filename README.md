# Hevy Notion Sync

A Convex-powered application that synchronizes workout data from the Hevy fitness app to Notion databases. This enables rich workout tracking, progress analysis, and program management within Notion's flexible workspace.

## Features

### Data Synchronization
- **Workout Sync**: Automatically sync completed workouts from Hevy to Notion
- **Routine Sync**: Sync workout routines/programs with hierarchical organization
- **Exercise Templates**: Maintain a database of exercises with muscle group categorization
- **Progress Tracking**: Aggregate performance metrics and progression data

### Notion Organization
- **Hierarchical Structure**: Week-based folders to Day-based routines to Exercise details
- **Rich Data Types**: Proper Notion properties for weights, reps, dates, and progress
- **Automatic Sorting**: Smart sorting by week, day, and exercise order
- **Progress Analytics**: Built-in progress tracking and performance metrics

### Convex Backend
- **Real-time Sync**: Event-driven synchronization with Hevy API
- **Incremental Updates**: Efficient syncing of only changed data
- **Error Handling**: Robust error recovery and retry mechanisms
- **Scalable Architecture**: Built on Convex for reliability and performance

## Quick Start

Choose your preferred setup method:

### Option 1: Automated Setup (Easiest)

1. **Clone and configure**
   ```bash
   git clone https://github.com/noah-vh/hevy-notion-sync.git
   cd hevy-notion-sync
   cp setup.config.example setup.config
   ```

2. **Edit setup.config** with your API keys:
   - HEVY_API_KEY
   - NOTION_API_KEY
   - NOTION_DATABASE_ID

3. **Run automated setup**
   ```bash
   npm run setup:auto
   ```

The script handles everything automatically: installs dependencies, configures Convex, sets environment variables, and deploys.

### Option 2: Manual CLI Setup

If you prefer to run the commands yourself:

1. **Clone the repository**
   ```bash
   git clone https://github.com/noah-vh/hevy-notion-sync.git
   cd hevy-notion-sync
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment file**
   ```bash
   cp .env.local.example .env.local
   ```

4. **Initialize Convex project**
   ```bash
   npx convex dev --once
   ```
   This creates a new Convex project and updates your .env.local

5. **Set environment variables**
   ```bash
   npx convex env set HEVY_API_KEY "your_hevy_api_key"
   npx convex env set NOTION_API_KEY "your_notion_key"
   npx convex env set NOTION_DATABASE_ID "your_database_id"
   ```

6. **Deploy to production**
   ```bash
   npx convex deploy --yes
   ```

7. **Run your first sync**
   ```bash
   npm run sync
   ```

## Data Schema

### Core Tables
- **workouts**: Completed workout sessions with metrics
- **exercises**: Individual exercises within workouts
- **sets**: Exercise sets with weights, reps, and performance data
- **routines**: Workout templates and programs
- **routineExercises**: Template exercises within routines
- **exerciseProgress**: Aggregated progression tracking

### Organization
- **routineFolders**: Week-based program organization
- **exerciseTemplates**: Exercise database with muscle groups
- **syncState**: Synchronization status and error tracking

## Prerequisites

Before setting up, you'll need:

### 1. Hevy API Key
- Get your API key from the Hevy app or website
- Required for accessing workout data

### 2. Notion Integration
- Go to https://www.notion.so/my-integrations
- Create a new integration
- Copy the Internal Integration Token
- Share your Notion database with the integration

### 3. Notion Database ID
- Create a database in Notion for workouts
- Copy the database ID from the URL
- Format: `https://notion.so/YOUR_WORKSPACE/DATABASE_ID?v=...`

### 4. Convex Account (Free)
- Sign up at https://convex.dev
- The setup script will guide you through project creation

### Deployment Commands

```bash
# Development
npm run dev

# Production deployment
npm run deploy

# Manual sync operations
npm run sync          # Full Hevy data sync
npm run sync:notion   # Sync to Notion
npm run status        # Check sync status
```

## Usage

### Automatic Sync
The application automatically syncs data from Hevy:
- New workouts are detected and synced
- Routine updates are captured
- Progress metrics are continuously updated

### Manual Operations
```bash
# Check current sync status
npm run status

# Force a full sync from Hevy
npm run sync

# Sync specific data to Notion
npm run sync:notion
```

### Notion Integration
Once configured, the app creates and maintains:
- Workout database with session details
- Routine database with program structure
- Exercise database with performance history
- Progress tracking with charts and metrics

## Architecture

### Convex Functions
- **hevy.ts**: Hevy API integration and data fetching
- **notion.ts**: Notion API integration and database management
- **sync.ts**: Orchestration and synchronization logic
- **schema.ts**: Database schema and relationships
- **crons.ts**: Scheduled sync operations

### Data Flow
1. **Hevy API** - Fetch workout and routine data
2. **Convex Database** - Store and process data
3. **Notion API** - Create and update Notion databases
4. **Progress Analytics** - Generate insights and metrics

## Development

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Deploy to production
npm run deploy
```

### File Structure
```
convex/
├── hevy.ts           # Hevy API integration
├── notion.ts         # Notion API integration
├── sync.ts          # Sync orchestration
├── schema.ts        # Database schema
├── crons.ts         # Scheduled tasks
├── http.ts          # HTTP endpoints
└── _generated/      # Generated types
```

## API Reference

### Key Functions
- `hevy:fullSync` - Complete data synchronization from Hevy
- `notion:syncToNotion` - Push data to Notion databases
- `sync:getStatus` - Get current synchronization status
- `sync:getProgress` - Get exercise progression data

## Security

- API keys stored securely in Convex environment
- Rate limiting and error handling for external APIs
- Secure authentication for all integrations

## Monitoring

The application includes comprehensive monitoring:
- Sync status tracking
- Error logging and recovery
- Performance metrics
- Data consistency checks

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Related

- [Hevy MCP Server](https://github.com/noah-vh/hevy-mcp-server) - MCP integration for Hevy API
- [Hevy API Documentation](https://api.hevyapp.com) - Official API reference
- [Convex Documentation](https://docs.convex.dev) - Backend platform docs