#!/bin/bash

# Quick Setup Script - Fully automated with environment variables as parameters
# Usage: ./setup-quick.sh <HEVY_API_KEY> <NOTION_API_KEY> <NOTION_DATABASE_ID>

set -e

if [ "$#" -ne 3 ]; then
    echo "Usage: ./setup-quick.sh <HEVY_API_KEY> <NOTION_API_KEY> <NOTION_DATABASE_ID>"
    exit 1
fi

HEVY_KEY=$1
NOTION_KEY=$2
NOTION_DB=$3

echo "Starting automated setup..."

# Install dependencies silently
npm install --quiet

# Copy environment template
cp -f .env.local.example .env.local

# Initialize Convex project (this will prompt for login if needed)
npx convex dev --once

# Get the deployment name from .env.local
DEPLOYMENT=$(grep CONVEX_DEPLOYMENT .env.local | cut -d '=' -f2 | cut -d ' ' -f1)

if [ -z "$DEPLOYMENT" ]; then
    echo "Error: Could not determine Convex deployment name"
    exit 1
fi

# Set environment variables using Convex CLI
echo "Setting environment variables..."
npx convex env set HEVY_API_KEY "$HEVY_KEY"
npx convex env set NOTION_API_KEY "$NOTION_KEY"
npx convex env set NOTION_DATABASE_ID "$NOTION_DB"

# Deploy to production
echo "Deploying to production..."
npx convex deploy --yes

echo "Setup complete! Run 'npm run sync' to start syncing."