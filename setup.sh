#!/bin/bash

# Hevy-Notion Sync Automated Setup Script
# This script automates the entire setup process for the Hevy-Notion Sync application

set -e  # Exit on any error

echo "======================================"
echo "  Hevy-Notion Sync Setup Wizard"
echo "======================================"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Check if convex is installed globally, if not install it
if ! command -v convex &> /dev/null; then
    echo "Installing Convex CLI globally..."
    npm install -g convex
fi

# Install dependencies
echo "Installing project dependencies..."
npm install

# Check if .env.local exists
if [ -f .env.local ]; then
    echo "Found existing .env.local file. Using existing configuration."
else
    echo "Creating .env.local from template..."
    cp .env.local.example .env.local
fi

# Initialize Convex project
echo ""
echo "Setting up Convex deployment..."
echo "This will create a new Convex project for you."
echo ""

# Run convex dev with --once flag to just set up the project
npx convex dev --once

echo ""
echo "======================================"
echo "  API Keys Configuration Required"
echo "======================================"
echo ""
echo "You need to add the following API keys to your Convex dashboard:"
echo ""
echo "1. Go to your Convex dashboard: https://dashboard.convex.dev"
echo "2. Select your project"
echo "3. Go to Settings > Environment Variables"
echo "4. Add these variables:"
echo "   - HEVY_API_KEY: Your Hevy API key"
echo "   - NOTION_API_KEY: Your Notion integration key"
echo "   - NOTION_DATABASE_ID: Your Notion database ID"
echo ""
echo "Press Enter after you've added the environment variables..."
read -r

# Deploy to production
echo ""
echo "Deploying to production..."
npx convex deploy --yes

echo ""
echo "======================================"
echo "  Setup Complete!"
echo "======================================"
echo ""
echo "Your Hevy-Notion Sync application is now deployed!"
echo ""
echo "Available commands:"
echo "  npm run dev          - Start development server"
echo "  npm run sync         - Run full sync from Hevy"
echo "  npm run sync:notion  - Sync data to Notion"
echo "  npm run status       - Check sync status"
echo ""
echo "To run your first sync:"
echo "  npm run sync"
echo ""