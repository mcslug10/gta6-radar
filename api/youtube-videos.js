const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3';

async function youtubeRequest(path, params, apiKey) {
  const url = new URL(YOUTUBE_BASE + '/' + path);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload?.error?.errors?.[0]?.reason || payload?.error?.status || 'youtube_api_error';
    const error = new Error(reason);
    error.reason = reason;
    throw error;
  }
  return payload;
}

function mapSearchItem(item) {
  const snippet = item.snippet || {};
  const id = item.id?.videoId;
  if (!id || snippet.liveBroadcastContent === 'live' || snippet.liveBroadcastContent === 'upcoming') return null;
  const thumbs = snippet.thumbnails || {};
  return {
    id,
    title: snippet.title || 'Vídeo de GTA VI',
    description: snippet.description || '',
    channel: snippet.channelTitle || 'YouTube',
    published: snippet.publishedAt || null,
    thumbnail: thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || '',
    type: 'video',
    viewerCount: null,
    viewCount: null,
    embeddable: true,
    url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(id)
  };
}

async function enrichItems(items, apiKey) {
  if (!items.length) return items;
  const ids = items.map(item => item.id).join(',');
  try {
    const details = await youtubeRequest('videos', {
      part: 'status,statistics',
      id: ids,
      maxResults: '50'
    }, apiKey);
    const byId = new Map((details.items || []).map(item => [item.id, item]));
    return items.map(item => {
      const detail = byId.get(item.id);
      return {
        ...item,
        embeddable: detail?.status?.embeddable !== false,
        viewCount: detail?.statistics?.viewCount || null
      };
    });
  } catch {
    return items;
  }
}

module.exports = async function handler(req, res) {
  // Refresh regular videos every four hours: six search.list calls/day.
  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=1800');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      configured: false,
      videos: [],
      updatedAt: new Date().toISOString(),
      message: 'Configure YOUTUBE_API_KEY na Vercel para ativar a busca de vídeos da comunidade.'
    });
  }

  try {
    const publishedAfter = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const payload = await youtubeRequest('search', {
      part: 'snippet',
      q: 'GTA 6 | GTA VI',
      type: 'video',
      order: 'date',
      maxResults: '18',
      publishedAfter,
      relevanceLanguage: 'pt',
      safeSearch: 'moderate'
    }, apiKey);

    const videos = (payload.items || []).map(mapSearchItem).filter(Boolean);
    const enriched = await enrichItems(videos, apiKey);
    return res.status(200).json({
      configured: true,
      videos: enriched,
      updatedAt: new Date().toISOString(),
      message: null
    });
  } catch (error) {
    console.error('YouTube Videos API:', error.reason || error.message);
    return res.status(200).json({
      configured: true,
      videos: [],
      error: error.reason || 'youtube_api_unavailable',
      updatedAt: new Date().toISOString(),
      message: 'Não foi possível consultar os vídeos neste momento.'
    });
  }
};
