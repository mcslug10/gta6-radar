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
  if (!id) return null;
  const thumbs = snippet.thumbnails || {};
  return {
    id,
    title: snippet.title || 'Vídeo de GTA VI',
    description: snippet.description || '',
    channel: snippet.channelTitle || 'YouTube',
    published: snippet.publishedAt || null,
    thumbnail: thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || '',
    type: 'live',
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
      part: 'status,statistics,liveStreamingDetails',
      id: ids,
      maxResults: '50'
    }, apiKey);
    const byId = new Map((details.items || []).map(item => [item.id, item]));
    return items.map(item => {
      const detail = byId.get(item.id);
      return {
        ...item,
        embeddable: detail?.status?.embeddable !== false,
        viewerCount: detail?.liveStreamingDetails?.concurrentViewers || null,
        viewCount: detail?.statistics?.viewCount || null
      };
    });
  } catch {
    return items;
  }
}

module.exports = async function handler(req, res) {
  // One search.list request every 20 minutes: 72 calls/day, below the default 100/day search quota.
  res.setHeader('Cache-Control', 's-maxage=1200, stale-while-revalidate=300');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      configured: false,
      lives: [],
      updatedAt: new Date().toISOString(),
      message: 'Configure YOUTUBE_API_KEY na Vercel para ativar a busca de transmissões ao vivo.'
    });
  }

  try {
    const payload = await youtubeRequest('search', {
      part: 'snippet',
      q: 'GTA 6 | GTA VI',
      type: 'video',
      eventType: 'live',
      order: 'viewCount',
      maxResults: '15',
      relevanceLanguage: 'pt',
      safeSearch: 'moderate'
    }, apiKey);

    const lives = (payload.items || []).map(mapSearchItem).filter(Boolean);
    const enriched = await enrichItems(lives, apiKey);
    return res.status(200).json({
      configured: true,
      lives: enriched.filter(item => item.embeddable !== false),
      updatedAt: new Date().toISOString(),
      message: enriched.length ? null : 'Nenhuma transmissão ao vivo sobre GTA VI foi encontrada nesta consulta.'
    });
  } catch (error) {
    console.error('YouTube Live API:', error.reason || error.message);
    return res.status(200).json({
      configured: true,
      lives: [],
      error: error.reason || 'youtube_api_unavailable',
      updatedAt: new Date().toISOString(),
      message: 'Não foi possível consultar as transmissões ao vivo neste momento.'
    });
  }
};
