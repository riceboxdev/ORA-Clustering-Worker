// K-Means clustering implementation for embeddings

interface KMeansOptions {
    k: number;
    maxIterations?: number;
    tolerance?: number;
}

interface ClusterResult {
    centroids: number[][];
    assignments: number[];
    iterations: number;
}

/**
 * K-Means++ initialization - smart seeding of initial centroids
 */
function initializeCentroids(vectors: number[][], k: number): number[][] {
    const centroids: number[][] = [];
    const n = vectors.length;
    const dim = vectors[0].length;

    // Pick first centroid randomly
    const firstIdx = Math.floor(Math.random() * n);
    centroids.push([...vectors[firstIdx]]);

    // Pick remaining centroids with probability proportional to distance squared
    for (let i = 1; i < k; i++) {
        const distances = vectors.map(v => {
            const minDist = Math.min(...centroids.map(c => euclideanDistance(v, c)));
            return minDist * minDist;
        });

        const totalDist = distances.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalDist;

        for (let j = 0; j < n; j++) {
            r -= distances[j];
            if (r <= 0) {
                centroids.push([...vectors[j]]);
                break;
            }
        }
    }

    return centroids;
}

/**
 * Euclidean distance between two vectors
 */
function euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Find closest centroid for a vector
 */
function assignToCentroid(vector: number[], centroids: number[][]): number {
    let minDist = Infinity;
    let assignment = 0;

    for (let i = 0; i < centroids.length; i++) {
        const dist = euclideanDistance(vector, centroids[i]);
        if (dist < minDist) {
            minDist = dist;
            assignment = i;
        }
    }

    return assignment;
}

/**
 * Recalculate centroids based on cluster assignments
 */
function recalculateCentroids(
    vectors: number[][],
    assignments: number[],
    k: number,
    dim: number
): number[][] {
    const centroids: number[][] = [];
    const counts: number[] = new Array(k).fill(0);
    const sums: number[][] = Array.from({ length: k }, () => new Array(dim).fill(0));

    for (let i = 0; i < vectors.length; i++) {
        const cluster = assignments[i];
        counts[cluster]++;
        for (let d = 0; d < dim; d++) {
            sums[cluster][d] += vectors[i][d];
        }
    }

    for (let i = 0; i < k; i++) {
        if (counts[i] > 0) {
            centroids.push(sums[i].map(s => s / counts[i]));
        } else {
            // Empty cluster - reinitialize randomly
            const randomIdx = Math.floor(Math.random() * vectors.length);
            centroids.push([...vectors[randomIdx]]);
        }
    }

    return centroids;
}

/**
 * Run K-Means clustering on a set of embedding vectors
 */
export function kMeansClustering(
    vectors: number[][],
    options: KMeansOptions
): ClusterResult {
    const { k, maxIterations = 100, tolerance = 0.0001 } = options;
    const n = vectors.length;
    const dim = vectors[0].length;

    if (n < k) {
        throw new Error(`Not enough vectors (${n}) for ${k} clusters`);
    }

    // Initialize centroids using K-Means++
    let centroids = initializeCentroids(vectors, k);
    let assignments = new Array(n).fill(0);
    let iterations = 0;

    for (let iter = 0; iter < maxIterations; iter++) {
        iterations = iter + 1;

        // Assign each vector to nearest centroid
        const newAssignments = vectors.map(v => assignToCentroid(v, centroids));

        // Check for convergence
        let changed = 0;
        for (let i = 0; i < n; i++) {
            if (newAssignments[i] !== assignments[i]) changed++;
        }

        assignments = newAssignments;

        if (changed / n < tolerance) {
            break;
        }

        // Recalculate centroids
        centroids = recalculateCentroids(vectors, assignments, k, dim);
    }

    return { centroids, assignments, iterations };
}

/**
 * Get posts closest to each centroid (cluster representatives)
 */
export function getClusterRepresentatives(
    vectors: number[][],
    posts: any[],
    centroids: number[][],
    assignments: number[],
    topN: number = 5
): { cluster: number; posts: any[]; similarity: number }[][] {
    const representatives: { cluster: number; posts: any[]; similarity: number }[][] = [];

    for (let c = 0; c < centroids.length; c++) {
        const clusterPosts: { post: any; similarity: number }[] = [];

        for (let i = 0; i < posts.length; i++) {
            if (assignments[i] === c) {
                const similarity = cosineSimilarity(vectors[i], centroids[c]);
                clusterPosts.push({ post: posts[i], similarity });
            }
        }

        // Sort by similarity and take top N
        clusterPosts.sort((a, b) => b.similarity - a.similarity);
        representatives.push(
            clusterPosts.slice(0, topN).map(cp => ({
                cluster: c,
                posts: [cp.post],
                similarity: cp.similarity
            }))
        );
    }

    return representatives;
}
