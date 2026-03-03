// TinyFish Web Agent API client
// Docs: https://docs.tinyfish.ai/
// Endpoint: POST /v1/automation/run (synchronous)

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
 * Run a TinyFish automation task synchronously.
 * @param {string} url - Target website URL
 * @param {string} goal - Natural language description of what to extract
 * @param {object} options - { browserProfile: 'lite'|'stealth', maxRetries: number }
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
export async function runAutomation(url, goal, options = {}) {
  if (!isConfigured()) {
    return { success: false, data: null, error: 'TinyFish API key not configured' };
  }

  const apiKey = getApiKey();
  const apiUrl = getApiUrl();

  const {
    browserProfile = 'stealth',
    maxRetries = 1,
  } = options;

  const body = {
    url,
    goal,
    browser_profile: browserProfile,
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000); // 55s — must fit Vercel's 60s maxDuration

      const res = await fetch(`${apiUrl}/automation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        // Synchronous endpoint returns { status, run_id, result, error }
        if (data.status === 'COMPLETED' && data.result) {
          return { success: true, data: data.result, error: null };
        }
        if (data.status === 'FAILED') {
          return { success: false, data: null, error: `TinyFish run failed: ${data.error?.message || 'unknown'}` };
        }
        // Fallback — return whatever we got
        return { success: true, data: data.result || data, error: null };
      }

      const retryable = [429, 500, 502, 503];
      if (retryable.includes(res.status) && attempt < maxRetries) {
        const waitTime = attempt * 3000;
        console.log(`TinyFish API returned ${res.status}, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      const errorText = await res.text().catch(() => '');
      return { success: false, data: null, error: `TinyFish API error ${res.status}: ${errorText}` };
    } catch (err) {
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) {
          console.log(`TinyFish request timed out, retrying (attempt ${attempt}/${maxRetries})...`);
          continue;
        }
        return { success: false, data: null, error: 'TinyFish request timed out after 120s' };
      }

      if (attempt < maxRetries) {
        const waitTime = attempt * 3000;
        console.log(`TinyFish error: ${err.message}, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      return { success: false, data: null, error: `TinyFish request failed: ${err.message}` };
    }
  }

  return { success: false, data: null, error: 'TinyFish request failed after all retries' };
}
