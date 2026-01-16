/**
 * Google Service Account JWT Authentication for Cloudflare Workers
 * 
 * Generates OAuth2 access tokens using a service account private key.
 * This allows the Worker to authenticate with Firestore and Vertex AI APIs.
 */

interface ServiceAccountKey {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
}

interface TokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

// Cache for access tokens
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get an access token for Google APIs using service account credentials
 */
export async function getGoogleAccessToken(
    serviceAccountKeyJson: string,
    scopes: string[] = ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/cloud-platform']
): Promise<string> {
    // Check cache
    if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
        return cachedToken.token;
    }

    const serviceAccount: ServiceAccountKey = JSON.parse(serviceAccountKeyJson);

    // Create JWT
    const jwt = await createSignedJwt(serviceAccount, scopes);

    // Exchange JWT for access token
    const tokenResponse = await fetch(serviceAccount.token_uri, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });

    if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        throw new Error(`Failed to get access token: ${error}`);
    }

    const data = await tokenResponse.json() as TokenResponse;

    // Cache the token
    cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
    };

    return data.access_token;
}

/**
 * Create a signed JWT for Google OAuth2
 */
async function createSignedJwt(
    serviceAccount: ServiceAccountKey,
    scopes: string[]
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // 1 hour

    // JWT Header
    const header = {
        alg: 'RS256',
        typ: 'JWT',
        kid: serviceAccount.private_key_id,
    };

    // JWT Payload
    const payload = {
        iss: serviceAccount.client_email,
        sub: serviceAccount.client_email,
        aud: serviceAccount.token_uri,
        iat: now,
        exp: expiry,
        scope: scopes.join(' '),
    };

    // Encode header and payload
    const encodedHeader = base64urlEncode(JSON.stringify(header));
    const encodedPayload = base64urlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Sign with RSA-SHA256
    const signature = await signWithRsa(signingInput, serviceAccount.private_key);

    return `${signingInput}.${signature}`;
}

/**
 * Sign data with RSA-SHA256 using the private key
 */
async function signWithRsa(data: string, privateKeyPem: string): Promise<string> {
    // Import the private key
    const key = await importPrivateKey(privateKeyPem);

    // Sign the data
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const signature = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' },
        key,
        dataBuffer
    );

    return base64urlEncode(signature);
}

/**
 * Import a PEM-encoded RSA private key
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
    // Remove PEM headers and convert to binary
    const pemContents = pem
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
        .replace(/-----END RSA PRIVATE KEY-----/g, '')
        .replace(/\s/g, '');

    const binaryDer = base64Decode(pemContents);

    return await crypto.subtle.importKey(
        'pkcs8',
        binaryDer,
        {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256',
        },
        false,
        ['sign']
    );
}

/**
 * Base64url encode (URL-safe base64 without padding)
 */
function base64urlEncode(data: string | ArrayBuffer): string {
    let base64: string;

    if (typeof data === 'string') {
        base64 = btoa(data);
    } else {
        const bytes = new Uint8Array(data);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        base64 = btoa(binary);
    }

    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Decode base64 to ArrayBuffer
 */
function base64Decode(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
