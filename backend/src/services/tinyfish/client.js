// AgentQL REST API client
// Note: read env vars dynamically (not at module level) because dotenv
// may not have loaded yet when ESM static imports are resolved.

function getApiKey() {
  return process.env.TINYFISH_API_KEY;
}

function getApiUrl() {
  return process.env.TINYFISH_API_URL || 'https://api.agentql.com/v1';
}

export function isConfigured() {
  const key = getApiKey();
  return !!(key && key.length > 0);
}

export async function queryData(url, query, options = {}) {
  if (!isConfigured()) {
    return { success: false, data: null, error: 'TinyFish API key not configured' };
  }

  const apiKey = getApiKey();
  const apiUrl = getApiUrl();

  const {
    browserProfile = 'stealth',
    waitMs = 2000,
    maxRetries = 2,
  } = options;

  const body = {
    url,
    query,
    params: {
      wait_for: waitMs,
      is_scroll_to_bottom_enabled: false,
      mode: browserProfile === 'stealth' ? 'standard' : 'fast',
    },
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`${apiUrl}/query-data`, {
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
        return { success: true, data: data.data || data, error: null };
      }

      const retryable = [429, 500, 502, 503, 529];
      if (retryable.includes(res.status) && attempt < maxRetries) {
        const waitTime = attempt * 2000;
        console.log(`AgentQL API returned ${res.status}, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      const errorText = await res.text().catch(() => '');
      return { success: false, data: null, error: `AgentQL API error ${res.status}: ${errorText}` };
    } catch (err) {
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) {
          console.log(`AgentQL request timed out, retrying (attempt ${attempt}/${maxRetries})...`);
          continue;
        }
        return { success: false, data: null, error: 'AgentQL request timed out after 30s' };
      }

      if (attempt < maxRetries) {
        const waitTime = attempt * 2000;
        console.log(`AgentQL error: ${err.message}, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      return { success: false, data: null, error: `AgentQL request failed: ${err.message}` };
    }
  }

  return { success: false, data: null, error: 'AgentQL request failed after all retries' };
}
