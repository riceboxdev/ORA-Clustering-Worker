// Firestore REST API client for Cloudflare Workers

interface FirestoreDocument {
    name: string;
    fields: Record<string, FirestoreValue>;
    createTime?: string;
    updateTime?: string;
}

interface FirestoreValue {
    stringValue?: string;
    integerValue?: string;
    doubleValue?: number;
    booleanValue?: boolean;
    arrayValue?: { values: FirestoreValue[] };
    mapValue?: { fields: Record<string, FirestoreValue> };
}

interface QueryResponse {
    documents?: FirestoreDocument[];
}

export class FirestoreClient {
    private projectId: string;
    private accessToken: string;
    private baseUrl: string;

    constructor(projectId: string, accessToken: string) {
        this.projectId = projectId;
        this.accessToken = accessToken;
        this.baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    }

    /**
     * Fetches posts with embeddings for clustering
     */
    async getPostsWithEmbeddings(limit: number = 500): Promise<any[]> {
        const query = {
            structuredQuery: {
                from: [{ collectionId: 'userPosts' }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: 'embedding' },
                        op: 'NOT_EQUAL',
                        value: { nullValue: null }
                    }
                },
                orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
                limit
            }
        };

        const response = await fetch(`${this.baseUrl}:runQuery`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(query)
        });

        if (!response.ok) {
            throw new Error(`Firestore query failed: ${response.statusText}`);
        }

        const results = await response.json() as any[];
        return results
            .filter(r => r.document)
            .map(r => this.parseDocument(r.document));
    }

    /**
     * Writes cluster suggestions to Firestore
     */
    async writeClusterSuggestions(suggestions: any[]): Promise<void> {
        // Write each suggestion as a document in ideaSuggestions collection
        for (const suggestion of suggestions) {
            const docPath = `${this.baseUrl}/ideaSuggestions/${suggestion.id}`;

            await fetch(docPath, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fields: this.toFirestoreFields(suggestion)
                })
            });
        }
    }

    /**
     * Updates clustering stats
     */
    async updateClusteringStats(stats: any): Promise<void> {
        const docPath = `${this.baseUrl}/system/clusteringStats`;

        await fetch(docPath, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: this.toFirestoreFields(stats)
            })
        });
    }

    private parseDocument(doc: FirestoreDocument): any {
        const id = doc.name.split('/').pop();
        const data: any = { id };

        for (const [key, value] of Object.entries(doc.fields || {})) {
            data[key] = this.parseValue(value);
        }

        return data;
    }

    private parseValue(value: FirestoreValue): any {
        if (value.stringValue !== undefined) return value.stringValue;
        if (value.integerValue !== undefined) return parseInt(value.integerValue);
        if (value.doubleValue !== undefined) return value.doubleValue;
        if (value.booleanValue !== undefined) return value.booleanValue;
        if (value.arrayValue) {
            return value.arrayValue.values?.map(v => this.parseValue(v)) || [];
        }
        if (value.mapValue) {
            const obj: any = {};
            for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
                obj[k] = this.parseValue(v);
            }
            return obj;
        }
        return null;
    }

    private toFirestoreFields(obj: any): Record<string, FirestoreValue> {
        const fields: Record<string, FirestoreValue> = {};

        for (const [key, value] of Object.entries(obj)) {
            fields[key] = this.toFirestoreValue(value);
        }

        return fields;
    }

    private toFirestoreValue(value: any): FirestoreValue {
        if (typeof value === 'string') return { stringValue: value };
        if (typeof value === 'number') {
            return Number.isInteger(value)
                ? { integerValue: String(value) }
                : { doubleValue: value };
        }
        if (typeof value === 'boolean') return { booleanValue: value };
        if (Array.isArray(value)) {
            return { arrayValue: { values: value.map(v => this.toFirestoreValue(v)) } };
        }
        if (typeof value === 'object' && value !== null) {
            return { mapValue: { fields: this.toFirestoreFields(value) } };
        }
        return { stringValue: '' };
    }
}
