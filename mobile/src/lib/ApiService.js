import { Platform } from 'react-native';

const DEFAULT_API_URL = 'https://senandika-sunyi.azmizaf.my.id/api';
const REQUEST_TIMEOUT = 12_000;
const PAGE_SIZE = 50;
const MAX_OFFSET = 10_000;
const MAX_EVIDENCE_SIZE = 2 * 1024 * 1024;
const invalidSessionListeners = new Set();

export const API_URL = (process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL)
  .replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function onInvalidSession(listener) {
  invalidSessionListeners.add(listener);
  return () => invalidSessionListeners.delete(listener);
}

function errorMessage(status, detail, signedIn) {
  if (status === 401 && signedIn) return 'Your session has expired. Please sign in again.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'The service is temporarily unavailable. Please try again.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const validation = detail.find((issue) => typeof issue?.msg === 'string');
    if (validation) return validation.msg.replace(/^Value error, /, '');
  }
  return 'The request could not be completed.';
}

async function request(path, { method = 'GET', token, json, form } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form ?? (json === undefined ? undefined : JSON.stringify(json)),
      signal: controller.signal,
    });

    if (response.status === 204) return null;
    const payload = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : null;

    if (response.ok) {
      if (payload === null) throw new ApiError('The service returned an unexpected response.', 0);
      return payload;
    }

    if (response.status === 401 && token) {
      invalidSessionListeners.forEach((listener) => listener(token));
    }
    throw new ApiError(errorMessage(response.status, payload?.detail, Boolean(token)), response.status);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = controller.signal.aborted
      ? 'The request took too long. Please try again.'
      : 'Could not reach Senandika Sunyi. Check your connection and try again.';
    throw new ApiError(message, 0);
  } finally {
    clearTimeout(timeoutId);
  }
}

function queryPath(path, fields) {
  const params = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') {
      params.push(`${name}=${encodeURIComponent(value)}`);
    }
  }
  return params.length ? `${path}?${params.join('&')}` : path;
}

async function collectPages(path, token) {
  const results = [];
  for (let offset = 0; offset <= MAX_OFFSET; offset += PAGE_SIZE) {
    const page = await request(queryPath(path, { limit: PAGE_SIZE, offset }), { token });
    results.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return results;
}

async function evidenceForm(evidence) {
  if (!evidence || (!evidence.file && !evidence.uri)) {
    throw new ApiError('Choose a JPEG or PNG image.', 422);
  }

  const name = evidence.name || evidence.file?.name || 'visit-evidence';
  const lowerName = name.toLowerCase();
  const inferredType = lowerName.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const size = evidence.file?.size ?? evidence.size;
  if (size > MAX_EVIDENCE_SIZE) {
    throw new ApiError('The image must be at most 2 MB.', 413);
  }

  const form = new FormData();
  if (Platform.OS === 'web') {
    if (evidence.file) {
      form.append('evidence', evidence.file, name);
    } else if (/^(blob:|data:image\/)/i.test(evidence.uri)) {
      const response = await fetch(evidence.uri);
      const blob = await response.blob();
      if (blob.size > MAX_EVIDENCE_SIZE) {
        throw new ApiError('The image must be at most 2 MB.', 413);
      }
      form.append('evidence', blob, name);
    } else {
      throw new ApiError('Choose the image again before uploading.', 422);
    }
  } else {
    form.append('evidence', {
      uri: evidence.uri,
      name,
      type: evidence.mimeType || inferredType,
    });
  }
  return form;
}

export function login(username, password) {
  return request('/auth/login', { method: 'POST', json: { username, password } });
}

export function listDestinations({ q, category, limit, offset } = {}) {
  return request(queryPath('/destinations', { q, category, limit, offset }));
}

export function getDestination(slug) {
  return request(`/destinations/${encodeURIComponent(slug)}`);
}

export function listFavorites(token) {
  return collectPages('/me/favorites', token);
}

export function setFavorite(slug, enabled, token) {
  return request(`/me/favorites/${encodeURIComponent(slug)}`, {
    method: enabled ? 'PUT' : 'DELETE',
    token,
  });
}

export function listLikes(token) {
  return request('/me/likes', { token });
}

export function setLike(slug, enabled, token) {
  return request(`/me/likes/${encodeURIComponent(slug)}`, {
    method: enabled ? 'PUT' : 'DELETE',
    token,
  });
}

export function listRatings(token) {
  return collectPages('/me/ratings', token);
}

export async function submitRating(slug, score, evidence, token) {
  const form = await evidenceForm(evidence);
  form.append('score', String(score));
  return request(`/destinations/${encodeURIComponent(slug)}/ratings`, {
    method: 'POST',
    token,
    form,
  });
}

export async function attachReportEvidence(reportId, evidence, token) {
  return request(`/me/reports/${encodeURIComponent(reportId)}/evidence`, {
    method: 'PUT',
    token,
    form: await evidenceForm(evidence),
  });
}

export async function submitReport(slug, details, evidence, token) {
  const form = evidence ? await evidenceForm(evidence) : undefined;
  const report = await request(`/destinations/${encodeURIComponent(slug)}/reports`, {
    method: 'POST',
    token,
    json: details,
  });

  if (form) {
    try {
      await request(`/me/reports/${encodeURIComponent(report.id)}/evidence`, {
        method: 'PUT',
        token,
        form,
      });
    } catch (error) {
      error.reportId = report.id;
      throw error;
    }
  }
  return report;
}
