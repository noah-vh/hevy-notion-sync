# Hevy Notion Sync

A Convex-powered application that synchronizes workout data from the Hevy fitness app to Notion databases. This enables rich workout tracking, progress analysis, and program management within Notion's flexible workspace.

## 🏋️ Features

### Data Synchronization
- **Workout Sync**: Automatically sync completed workouts from Hevy to Notion
- **Routine Sync**: Sync workout routines/programs with hierarchical organization
- **Exercise Templates**: Maintain a database of exercises with muscle group categorization
- **Progress Tracking**: Aggregate performance metrics and progression data

### Notion Organization
- **Hierarchical Structure**: Week-based folders → Day-based routines → Exercise details
- **Rich Data Types**: Proper Notion properties for weights, reps, dates, and progress
- **Automatic Sorting**: Smart sorting by week, day, and exercise order
- **Progress Analytics**: Built-in progress tracking and performance metrics

### Convex Backend
- **Real-time Sync**: Event-driven synchronization with Hevy API
- **Incremental Updates**: Efficient syncing of only changed data
- **Error Handling**: Robust error recovery and retry mechanisms
- **Scalable Architecture**: Built on Convex for reliability and performance

## 🚀 Deployment

This application is deployed on Convex cloud:

- **Production URL**: https://marvelous-tern-924.convex.cloud
- **Environment**: Production-ready with automatic scaling
- **Status**: Active with real-time data synchronization

## 📊 Data Schema

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

## 🔧 Setup & Configuration

### Prerequisites
- Hevy API access and API key
- Notion integration and database setup
- Convex account and deployment

### Environment Variables
Required environment variables for the Convex deployment:

```bash
HEVY_API_KEY=your_hevy_api_key
NOTION_API_KEY=your_notion_integration_key
NOTION_DATABASE_ID=your_notion_database_id
```

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

## 📈 Usage

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

## 🏗️ Architecture

### Convex Functions
- **hevy.ts**: Hevy API integration and data fetching
- **notion.ts**: Notion API integration and database management
- **sync.ts**: Orchestration and synchronization logic
- **schema.ts**: Database schema and relationships
- **crons.ts**: Scheduled sync operations

### Data Flow
1. **Hevy API** → Fetch workout and routine data
2. **Convex Database** → Store and process data
3. **Notion API** → Create and update Notion databases
4. **Progress Analytics** → Generate insights and metrics

## 🔄 Sync Status

Current deployment status:
- **Workouts**: 39 synced sessions
- **Exercises**: 211 exercise instances
- **Sets**: 641 individual sets tracked
- **Last Sync**: 2026-01-07T06:19:39.800Z

## 🛠️ Development

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

## 📝 API Reference

### Key Functions
- `hevy:fullSync` - Complete data synchronization from Hevy
- `notion:syncToNotion` - Push data to Notion databases
- `sync:getStatus` - Get current synchronization status
- `sync:getProgress` - Get exercise progression data

## 🔐 Security

- API keys stored securely in Convex environment
- Rate limiting and error handling for external APIs
- Secure authentication for all integrations

## 📊 Monitoring

The application includes comprehensive monitoring:
- Sync status tracking
- Error logging and recovery
- Performance metrics
- Data consistency checks

## 🤝 Contributing

This is a production application managing real workout data. Contact the maintainer before making changes.

## 📄 License

Private project - All rights reserved

## 🔗 Related

- [Hevy MCP Server](https://github.com/noah-vh/hevy-mcp-server) - MCP integration for Hevy API
- [Hevy API Documentation](https://api.hevyapp.com) - Official API reference
- [Convex Documentation](https://docs.convex.dev) - Backend platform docs