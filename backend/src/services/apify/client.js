// Apify API client
// Docs: https://docs.apify.com/api/v2
// Async pattern: start actor run → poll status → get dataset items

const APIFY_BASE = 'https://api.apify.com/v2';

function getApiToken() {
  return (process.env.APIFY_API_TOKEN || '').trim();
}

export function isConfigured() {
  const token = getApiToken();
  return !!(token && token.length > 0);
}

/**
 * Start an Apify actor run.
 * Returns { success, runId, error }
 */
export async function startActor(actorId, input, options = {}) {
  if (!isConfigured()) {
    return { success: false, runId: null, error: 'APIFY_API_TOKEN not configured' };
  }

  const token = getApiToken();
  const { timeout = 120, memory = 256 } = options;

  try {
    const res = await fetch(
      `${APIFY_BASE}/acts/${actorId}/runs?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      return { success: true, runId: data.data?.id, error: null };
    }

    const errorText = await res.text().catch(() => '');
    return { success: false, runId: null, error: `Apify API error ${res.status}: ${errorText}` };
  } catch (err) {
    return { success: false, runId: null, error: `Apify request failed: ${err.message}` };
  }
}

/**
 * Get the status of an actor run.
 * Returns { status, defaultDatasetId, error }
 */
export async function getRun(runId) {
  if (!isConfigured()) {
    return { status: 'FAILED', defaultDatasetId: null, error: 'APIFY_API_TOKEN not configured' };
  }

  const token = getApiToken();

  try {
    const res = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const run = data.data || {};
      return {
        status: run.status || 'RUNNING',
        defaultDatasetId: run.defaultDatasetId || null,
        error: null,
      };
    }

    return { status: 'FAILED', defaultDatasetId: null, error: `Apify API error ${res.status}` };
  } catch (err) {
    return { status: 'FAILED', defaultDatasetId: null, error: `Apify request failed: ${err.message}` };
  }
}

/**
 * Get items from an Apify dataset.
 * Returns array of result items.
 */
export async function getDatasetItems(datasetId, options = {}) {
  if (!isConfigured()) return [];

  const token = getApiToken();
  const { limit = 50 } = options;

  try {
    const res = await fetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&limit=${limit}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      }
    );

    if (res.ok) {
      return await res.json();
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Run an actor and wait for results (poll until done).
 * Combines startActor + polling + getDatasetItems.
 * Returns { success, items, error }
 */
export async function runActorAndWaitForResults(actorId, input, options = {}) {
  const { timeoutMs = 120000, pollIntervalMs = 4000, maxItems = 50 } = options;

  const start = await startActor(actorId, input);
  if (!start.success) {
    return { success: false, items: [], error: start.error };
  }

  const runId = start.runId;
  const deadline = Date.now() + timeoutMs;

  // Poll until done or timeout
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

    const runStatus = await getRun(runId);

    if (runStatus.status === 'SUCCEEDED') {
      if (!runStatus.defaultDatasetId) {
        return { success: true, items: [], error: null };
      }
      const items = await getDatasetItems(runStatus.defaultDatasetId, { limit: maxItems });
      return { success: true, items, error: null };
    }

    if (runStatus.status === 'FAILED' || runStatus.status === 'ABORTED' || runStatus.status === 'TIMED-OUT') {
      return { success: false, items: [], error: `Apify actor run ${runStatus.status}: ${runStatus.error || 'unknown error'}` };
    }

    // RUNNING, READY, or other transitional states — keep polling
  }

  return { success: false, items: [], error: `Apify actor run timed out after ${timeoutMs / 1000}s` };
}
