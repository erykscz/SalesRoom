// GitHub research via GitHub REST API
// Docs: https://docs.github.com/en/rest

const GITHUB_BASE = 'https://api.github.com';

function getHeaders() {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'SalesRoom-Research/1.0',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) return { ok: false, status: res.status, data: null };
  return { ok: true, status: res.status, data: await res.json() };
}

async function searchUser(companyName) {
  // Try searching for organization first
  const orgResult = await fetchJson(`${GITHUB_BASE}/orgs/${encodeURIComponent(companyName.toLowerCase().replace(/\s+/g, '-'))}`);
  if (orgResult.ok) return { type: 'org', login: orgResult.data.login };

  // Try searching users by company name
  const searchResult = await fetchJson(`${GITHUB_BASE}/search/users?q=${encodeURIComponent(companyName)}+type:org&per_page=3`);
  if (searchResult.ok && searchResult.data.total_count > 0) {
    return { type: 'org', login: searchResult.data.items[0].login };
  }

  return null;
}

async function getOrgProfile(login) {
  const result = await fetchJson(`${GITHUB_BASE}/orgs/${encodeURIComponent(login)}`);
  if (!result.ok) return null;
  return result.data;
}

async function getUserProfile(login) {
  const result = await fetchJson(`${GITHUB_BASE}/users/${encodeURIComponent(login)}`);
  if (!result.ok) return null;
  return result.data;
}

async function getRepos(login, type = 'orgs') {
  const endpoint = type === 'orgs'
    ? `${GITHUB_BASE}/orgs/${encodeURIComponent(login)}/repos?sort=updated&per_page=10`
    : `${GITHUB_BASE}/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=10`;
  const result = await fetchJson(endpoint);
  if (!result.ok) return [];
  return result.data;
}

function aggregateLanguages(repos) {
  const langCount = {};
  for (const repo of repos) {
    if (repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + 1;
    }
  }
  return Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => ({ language: lang, repo_count: count }));
}

export async function research(companyName, hints = {}) {
  try {
    let login = hints.github_username;
    let accountType = 'org';

    if (!login) {
      const found = await searchUser(companyName);
      if (!found) {
        return {
          success: false,
          data: null,
          error: `GitHub organization "${companyName}" not found`,
          profile: null,
        };
      }
      login = found.login;
      accountType = found.type;
    }

    const profile = accountType === 'org'
      ? await getOrgProfile(login)
      : await getUserProfile(login);

    if (!profile) {
      return {
        success: false,
        data: null,
        error: `GitHub profile "${login}" could not be fetched`,
        profile: null,
      };
    }

    const repos = await getRepos(login, accountType === 'org' ? 'orgs' : 'users');
    const languages = aggregateLanguages(repos);

    const data = {
      login: profile.login,
      name: profile.name,
      bio: profile.bio || profile.description,
      company: profile.company,
      location: profile.location,
      blog: profile.blog,
      email: profile.email,
      public_repos: profile.public_repos,
      followers: profile.followers,
      following: profile.following,
      created_at: profile.created_at,
      avatar_url: profile.avatar_url,
      html_url: profile.html_url,
      account_type: accountType,
      languages,
      top_repos: repos.slice(0, 5).map(r => ({
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        forks: r.forks_count,
        updated_at: r.updated_at,
        html_url: r.html_url,
      })),
    };

    return {
      success: true,
      data,
      error: null,
      profile: {
        platform: 'github',
        profile_url: profile.html_url,
        username: profile.login,
        display_name: profile.name || profile.login,
        bio: profile.bio || profile.description || null,
        followers_count: profile.followers || null,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `GitHub research failed: ${err.message}`,
      profile: null,
    };
  }
}
