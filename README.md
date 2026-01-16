# ORA Clustering Worker

Cloudflare Worker that runs weekly to analyze post embeddings and discover new idea clusters using K-Means clustering.

## Features

- **Weekly Cron Trigger**: Runs every Sunday at 3 AM UTC
- **K-Means Clustering**: Analyzes post embeddings to find natural groupings
- **Firestore Integration**: Reads posts and writes cluster suggestions
- **Manual Trigger**: HTTP endpoint for on-demand clustering

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Secrets

Set the following secrets using Wrangler:

```bash
# Firebase project ID
wrangler secret put FIREBASE_PROJECT_ID

# Service account key (JSON string)
wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY
```

### 3. Deploy

```bash
npm run deploy
```

## API Endpoints

### POST /cluster

Manually trigger clustering.

```bash
curl -X POST https://ora-clustering-worker.<your-subdomain>.workers.dev/cluster \
  -H "Content-Type: application/json" \
  -d '{"k": 8, "sampleSize": 300}'
```

### GET /health

Health check endpoint.

## Development

```bash
# Run locally
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Cloudflare Worker                   │
│                                                     │
│  ┌─────────────┐    ┌──────────────────────────┐   │
│  │ Cron Trigger│───▶│ runClustering()          │   │
│  │ (Weekly)    │    │  1. Fetch posts          │   │
│  └─────────────┘    │  2. Extract embeddings   │   │
│                     │  3. Run K-Means          │   │
│  ┌─────────────┐    │  4. Generate names       │   │
│  │ HTTP /cluster│───▶│  5. Write suggestions   │   │
│  │ (Manual)    │    └──────────────────────────┘   │
│  └─────────────┘                                    │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
               ┌──────────────────┐
               │    Firestore     │
               │  - userPosts     │
               │  - ideaSuggestions│
               │  - system/stats  │
               └──────────────────┘
```

## TODO

- [ ] Implement proper OAuth2 JWT auth for Firestore
- [ ] Add Workers AI integration for cluster naming
- [ ] Add Vectorize integration for optimized vector search
- [ ] Add rate limiting and error handling
