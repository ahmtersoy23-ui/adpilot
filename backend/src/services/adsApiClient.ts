import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ADS_API_BASE = 'https://advertising-api.amazon.com';
const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const TOKEN_TTL_MS = 55 * 60_000; // 55min (tokens expire in 60min)

let cachedToken: { token: string; expiresAt: number } | null = null;

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

/**
 * Get LWA access token (cached 55min).
 */
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const res = await axios.post(
    LWA_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: getEnv('ADS_REFRESH_TOKEN'),
      client_id: getEnv('ADS_CLIENT_ID'),
      client_secret: getEnv('ADS_CLIENT_SECRET'),
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
  );

  const token = res.data.access_token;
  if (!token) throw new Error('LWA: no access_token in response');

  cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  console.log('[AdsAPI] Token acquired');
  return token;
}

/**
 * Get configured Ads API axios instance for campaign management.
 */
export async function getAdsClient(): Promise<AxiosInstance> {
  const token = await getToken();
  const profileId = getEnv('ADS_PROFILE_ID');

  return axios.create({
    baseURL: ADS_API_BASE,
    timeout: 30_000,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Amazon-Advertising-API-ClientId': getEnv('ADS_CLIENT_ID'),
      'Amazon-Advertising-API-Scope': profileId,
      'Content-Type': 'application/vnd.spNegativeKeyword.v3+json',
    },
  });
}
