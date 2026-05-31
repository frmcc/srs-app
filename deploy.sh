#!/bin/bash
# SRS Quiz System - Deployment Setup Script
# Run this script to set up Turso database and deploy to Vercel

set -e

echo "🚀 SRS Quiz System - Deployment Setup"
echo "======================================"
echo ""

# Step 1: Install Turso CLI
echo "📦 Step 1: Installing Turso CLI..."
if ! command -v turso &> /dev/null; then
  curl -sSfL https://get.tur.so/install.sh | bash
  echo "✅ Turso CLI installed"
else
  echo "✅ Turso CLI already installed"
fi

# Step 2: Login to Turso
echo ""
echo "🔑 Step 2: Login to Turso (free account)..."
turso auth login

# Step 3: Create database
echo ""
echo "🗄️  Step 3: Creating Turso database..."
turso db create srs-quiz-db
echo "✅ Database created"

# Step 4: Get credentials
echo ""
echo "🔐 Step 4: Getting database credentials..."
TURSO_URL=$(turso db show srs-quiz-db --url)
TURSO_TOKEN=$(turso db tokens create srs-quiz-db)
echo "Database URL: $TURSO_URL"
echo ""

# Step 5: Push schema to Turso
echo "📋 Step 5: Pushing schema to database..."
DATABASE_URL="$TURSO_URL" npx prisma db push
echo "✅ Schema pushed"

# Step 6: Deploy to Vercel
echo ""
echo "🌐 Step 6: Deploying to Vercel..."
echo ""
echo "Set these environment variables in Vercel:"
echo "  TURSO_DATABASE_URL = $TURSO_URL"
echo "  TURSO_AUTH_TOKEN   = $TURSO_TOKEN"
echo "  GEMINI_API_KEY     = (your existing key)"
echo "  NEXT_PUBLIC_VAPID_PUBLIC_KEY = (from .env)"
echo "  VAPID_PRIVATE_KEY  = (from .env)"
echo "  VAPID_EMAIL        = mailto:srs-app@example.com"
echo ""
echo "Run: npx -y vercel"
echo ""
echo "✅ Setup complete!"
