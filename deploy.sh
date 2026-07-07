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

# Step 3: Create database (idempotent — ignore "already exists")
echo ""
echo "🗄️  Step 3: Creating Turso database..."
turso db create srs-quiz-db || echo "(database already exists — continuing)"
echo "✅ Database ready"

# Step 4: Get credentials
echo ""
echo "🔐 Step 4: Getting database credentials..."
TURSO_URL=$(turso db show srs-quiz-db --url)
TURSO_TOKEN=$(turso db tokens create srs-quiz-db)
echo "Database URL: $TURSO_URL"
echo ""

# Step 5: Apply migrations to Turso.
# NOTE: `prisma db push` / `prisma migrate deploy` cannot connect to a libsql://
# URL (they lack the driver adapter), so we apply prisma/migrations via the
# libSQL client. This runner is idempotent and records applied migrations.
echo "📋 Step 5: Applying migrations to database..."
TURSO_DATABASE_URL="$TURSO_URL" TURSO_AUTH_TOKEN="$TURSO_TOKEN" node migrate-turso.mjs
echo "✅ Migrations applied"

# Step 6: Deploy to Vercel
echo ""
echo "🌐 Step 6: Deploying to Vercel..."
echo ""
echo "Set these environment variables in Vercel:"
echo "  TURSO_DATABASE_URL = $TURSO_URL"
echo "  TURSO_AUTH_TOKEN   = (printed below — keep it secret, do not paste into shared logs)"
echo "$TURSO_TOKEN"
echo "  GEMINI_API_KEY     = (your existing key)"
echo "  NEXT_PUBLIC_VAPID_PUBLIC_KEY = (from .env)"
echo "  VAPID_PRIVATE_KEY  = (from .env)"
echo "  VAPID_EMAIL        = mailto:srs-app@example.com"
echo ""
echo "Run: npx -y vercel"
echo ""
echo "✅ Setup complete!"
