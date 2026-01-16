// Type definitions for the clustering worker

export interface PostEmbedding {
    id: string;
    embedding: number[];
    tags?: string[];
    description?: string;
    imageUrl?: string;
}

export interface ClusterResult {
    id: string;
    name: string;
    centroid: number[];
    postCount: number;
    thumbnailUrls: string[];
    topTags: string[];
}

export interface ClusteringStats {
    lastRunAt: number;
    lastRunBy: 'scheduled' | 'manual';
    clustersFound: number;
    postsAnalyzed: number;
}

export interface Env {
    FIREBASE_PROJECT_ID: string;
    FIREBASE_SERVICE_ACCOUNT_KEY: string;
    VERTEX_AI_LOCATION: string;
    AI: Ai;
}
