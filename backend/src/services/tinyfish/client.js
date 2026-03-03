// TinyFish Web Agent API client
// Docs: https://docs.tinyfish.ai/
// Uses async API to avoid serverless timeouts

function getApiKey() {
  return (process.env.TINYFISH_API_KEY || '').trim();
}

function getApiUrl() {
  return (process.env.TINYFISH_API_URL || 'https://agent.tinyfish.ai/v1').trim();
}

export function isConfigured() {
  const key = getApiKey();
  return !!(key && key.length > 0);
}

/**
 * Start an async TinyFish automation (returns run_id immediately).
 */
export async function startAutomation(url, goal, options = {}) {
  if (!isConfigured()) {
    return { success: false, runId: null, error: 'TinyFish API key not configured' };
  }

  const apiKey = getApiKey();
  const apiUrl = getApiUrl();
  const { browserProfile = 'stealth' } = options;

  const body = { url, goal, browser_profile: browserProfile };

  try {
    const res = await fetch(`${apiUrl}/automation/run-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, runId: data.run_id, error: null };
    }

    const errorText = await res.text().catch(() => '');
    return { success: false, runId: null, error: `TinyFish API error ${res.status}: ${errorText}` };
  } catch (err) {
    return { success: false, runId: null, error: `TinyFish request failed: ${err.message}` };
  }
}

/**
 * Check the status of an async TinyFish run.
 * Returns { status: 'PENDING'|'RUNNING'|'COMPLETED'|'FAILED', result, error }
 */
export async function getRun(runId) {
  if (!isConfigured()) {
    return { status: 'FAILED', result: null, error: 'TinyFish API key not configured' };
  }

  const apiKey = getApiKey();
  const apiUrl = getApiUrl();

  try {
    const res = await fetch(`${apiUrl}/runs/${runId}`, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        status: data.status || 'PENDING',
        result: data.result || null,
        error: data.error || null,
      };
    }

    return { status: 'FAILED', result: null, error: `TinyFish API error ${res.status}` };
  } catch (err) {
    return { status: 'FAILED', result: null, error: `TinyFish request failed: ${err.message}` };
  }
}

/**
 * Run automation synchronously (blocks until done, for simple/fast targets).
 * Use for website scraping (typically <40s). Avoid for LinkedIn.
 */
export async function runAutomation(url, goal, options = {}) {
  if (!isConfigured()) {
    return { success: false, data: null, error: 'TinyFish API key not configured' };
  }

  const apiKey = getApiKey();
  const apiUrl = getApiUrl();
  const { browserProfile = 'lite' } = options;

  const body = { url, goal, browser_profile: browserProfile };

  try {
    const res = await fetch(`${apiUrl}/automation/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50000), // 50s for Vercel's 60s limit
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'COMPLETED' && data.result) {
        return { success: true, data: data.result, error: null };
      }
      if (data.status === 'FAILED') {
        return { success: false, data: null, error: `TinyFish run failed: ${data.error?.message || 'unknown'}` };
      }
      return { success: true, data: data.result || data, error: null };
    }

    const errorText = await res.text().catch(() => '');
    return { success: false, data: null, error: `TinyFish API error ${res.status}: ${errorText}` };
  } catch (err) {
    return { success: false, data: null, error: `TinyFish request failed: ${err.message}` };
  }
}
