#!/bin/bash

# Fully Automated Setup - Reads from setup.config file
# Just run: ./setup-auto.sh

set -e

echo "======================================"
echo "  Hevy-Notion Sync Auto Setup"
echo "======================================"

# Check for setup.config
if [ ! -f setup.config ]; then
    if [ -f setup.config.example ]; then
        echo "setup.config not found."
        echo "Please copy setup.config.example to setup.config and add your API keys."
        echo ""
        echo "Run: cp setup.config.example setup.config"
        echo "Then edit setup.config with your API keys."
        exit 1
    else
        echo "Error: setup.config.example not found"
        exit 1
    fi
fi

# Source the configuration
source setup.config

# Validate required variables
if [ -z "$HEVY_API_KEY" ] || [ "$HEVY_API_KEY" == "your_hevy_api_key_here" ]; then
    echo "Error: HEVY_API_KEY not configured in setup.config"
    exit 1
fi

if [ -z "$NOTION_API_KEY" ] || [ "$NOTION_API_KEY" == "your_notion_integration_key_here" ]; then
    echo "Error: NOTION_API_KEY not configured in setup.config"
    exit 1
fi

if [ -z "$NOTION_DATABASE_ID" ] || [ "$NOTION_DATABASE_ID" == "your_notion_database_id_here" ]; then
    echo "Error: NOTION_DATABASE_ID not configured in setup.config"
    exit 1
fi

echo "Configuration loaded successfully!"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install --quiet

# Set up .env.local
cp -f .env.local.example .env.local

# Initialize Convex
echo "Initializing Convex project..."
npx convex dev --once

# Set environment variables
echo "Configuring environment variables..."
npx convex env set HEVY_API_KEY "$HEVY_API_KEY" --yes 2>/dev/null || true
npx convex env set NOTION_API_KEY "$NOTION_API_KEY" --yes 2>/dev/null || true
npx convex env set NOTION_DATABASE_ID "$NOTION_DATABASE_ID" --yes 2>/dev/null || true

# Deploy
echo "Deploying to production..."
npx convex deploy --yes

echo ""
echo "======================================"
echo "  Setup Complete!"
echo "======================================"
echo ""
echo "Your application is ready to use!"
echo ""
echo "Commands:"
echo "  npm run sync         - Sync from Hevy"
echo "  npm run sync:notion  - Sync to Notion"
echo "  npm run status       - Check status"
echo ""
echo "Starting your first sync..."
npm run sync

echo ""
echo "Sync initiated! Check status with: npm run status"