/**
 * ORA Clustering Worker
 * 
 * Scheduled weekly to analyze post embeddings and discover new idea clusters.
 * Uses K-Means clustering on post embeddings and generates semantic names using AI.
 */

import { FirestoreClient } from './lib/firestore';
import { kMeansClustering, cosineSimilarity } from './lib/kmeans';
import { getGoogleAccessToken } from './lib/auth';
import type { Env, ClusterResult, ClusteringStats } from './types';

// Configuration
const DEFAULT_K = 8;
const DEFAULT_SAMPLE_SIZE = 300;
const MIN_CLUSTER_SIZE = 3;

export default {
    /**
     * Scheduled handler - runs weekly via Cron Trigger
     */
    async scheduled(
        controller: ScheduledController,
        env: Env,
        ctx: ExecutionContext
    ): Promise<void> {
        console.log('Starting scheduled clustering job...');

        try {
            const results = await runClustering(env, {
                k: DEFAULT_K,
                sampleSize: DEFAULT_SAMPLE_SIZE
            });

            console.log(`Clustering complete. Found ${results.length} clusters.`);

            // Update stats
            await updateStats(env, {
                lastRunAt: Date.now(),
                lastRunBy: 'scheduled',
                clustersFound: results.length,
                postsAnalyzed: DEFAULT_SAMPLE_SIZE
            });

        } catch (error) {
            console.error('Clustering failed:', error);
            throw error;
        }
    },

    /**
     * HTTP handler - for manual triggers or API access
     */
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/cluster' && request.method === 'POST') {
            try {
                const body = await request.json() as { k?: number; sampleSize?: number };
                const k = body.k || DEFAULT_K;
                const sampleSize = body.sampleSize || DEFAULT_SAMPLE_SIZE;

                const results = await runClustering(env, { k, sampleSize });

                await updateStats(env, {
                    lastRunAt: Date.now(),
                    lastRunBy: 'manual',
                    clustersFound: results.length,
                    postsAnalyzed: sampleSize
                });

                return new Response(JSON.stringify({
                    success: true,
                    clusters: results.length,
                    message: `Found ${results.length} idea clusters`
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (error) {
                return new Response(JSON.stringify({
                    success: false,
                    error: (error as Error).message
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        if (url.pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response('Not Found', { status: 404 });
    }
};

/**
 * Main clustering logic
 */
async function runClustering(
    env: Env,
    options: { k: number; sampleSize: number }
): Promise<ClusterResult[]> {
    const { k, sampleSize } = options;

    // 1. Get access token for Firestore using JWT auth
    const accessToken = await getGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT_KEY);
    const firestore = new FirestoreClient(env.FIREBASE_PROJECT_ID, accessToken);

    // 2. Fetch posts with embeddings
    console.log(`Fetching ${sampleSize} posts with embeddings...`);
    const posts = await firestore.getPostsWithEmbeddings(sampleSize);

    if (posts.length < k) {
        throw new Error(`Not enough posts with embeddings (${posts.length}) for ${k} clusters`);
    }

    // 3. Extract embeddings
    const vectors: number[][] = [];
    const validPosts: any[] = [];

    for (const post of posts) {
        const embedding = post.embedding;
        if (Array.isArray(embedding) && embedding.length > 0) {
            vectors.push(embedding);
            validPosts.push(post);
        }
    }

    console.log(`Running K-Means with ${vectors.length} vectors, k=${k}...`);

    // 4. Run K-Means clustering
    const { centroids, assignments, iterations } = kMeansClustering(vectors, { k });
    console.log(`K-Means converged in ${iterations} iterations`);

    // 5. Process clusters and generate suggestions
    const suggestions: ClusterResult[] = [];

    for (let i = 0; i < k; i++) {
        const clusterPosts: { post: any; similarity: number }[] = [];

        for (let j = 0; j < validPosts.length; j++) {
            if (assignments[j] === i) {
                const similarity = cosineSimilarity(vectors[j], centroids[i]);
                clusterPosts.push({ post: validPosts[j], similarity });
            }
        }

        // Skip small clusters
        if (clusterPosts.length < MIN_CLUSTER_SIZE) continue;

        // Sort by similarity to centroid
        clusterPosts.sort((a, b) => b.similarity - a.similarity);

        // Extract top tags
        const tagCounts: Record<string, number> = {};
        for (const { post } of clusterPosts) {
            if (post.tags && Array.isArray(post.tags)) {
                for (const tag of post.tags) {
                    const normalized = tag.toLowerCase().trim();
                    if (normalized.length > 1) {
                        tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
                    }
                }
            }
        }

        const topTags = Object.entries(tagCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([tag]) => tag);

        // Generate cluster name (simple version - use top tag)
        const clusterName = topTags.length > 0
            ? topTags[0].charAt(0).toUpperCase() + topTags[0].slice(1)
            : `Cluster ${i + 1}`;

        // Extract thumbnail URLs
        const thumbnailUrls = clusterPosts
            .slice(0, 4)
            .map(cp => cp.post.content?.jpegUrl || cp.post.content?.url || cp.post.imageUrl)
            .filter(Boolean);

        suggestions.push({
            id: `cluster-${i}-${Date.now()}`,
            name: clusterName,
            centroid: centroids[i],
            postCount: clusterPosts.length,
            thumbnailUrls,
            topTags
        });
    }

    // 6. Write suggestions to Firestore
    console.log(`Writing ${suggestions.length} suggestions to Firestore...`);
    await firestore.writeClusterSuggestions(suggestions);

    return suggestions;
}

/**
 * Update clustering stats in Firestore
 */
async function updateStats(env: Env, stats: ClusteringStats): Promise<void> {
    const accessToken = await getGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT_KEY);
    const firestore = new FirestoreClient(env.FIREBASE_PROJECT_ID, accessToken);
    await firestore.updateClusteringStats(stats);
}

