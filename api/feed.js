const USER_AGENT = 'GTA6Radar/1.0 (+https://gta6-radar-br.vercel.app)';

function decodeXml(value = '') {
  return String(value)
    .replaceAll('<![CDATA[', '').replaceAll(']]>', '')
    .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&apos;', "'");
}
function tag(block, name) {
  const start = block.indexOf('<' + name);
  if (start < 0) return '';
  const openEnd = block.indexOf('>', start);
  if (openEnd < 0) return '';
  const close = block.indexOf('</' + name + '>', openEnd + 1);
  if (close < 0) return '';
  return decodeXml(block.slice(openEnd + 1, close).trim());
}
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, 'accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Feed returned ' + response.status);
    return await response.text();
  } finally { clearTimeout(timer); }
}
function parseNews(xml) {
  return xml.split('<item>').slice(1, 13).map(part => {
    const block = part.split('</item>')[0];
    return {
      title: tag(block, 'title'),
      link: tag(block, 'link'),
      published: tag(block, 'pubDate'),
      source: tag(block, 'source') || 'Notícias GTA VI'
    };
  }).filter(item => item.title && item.link);
}
function parseVideos(xml) {
  return xml.split('<entry>').slice(1, 13).map(part => {
    const block = part.split('</entry>')[0];
    return {
      id: tag(block, 'yt:videoId'),
      title: tag(block, 'title'),
      channel: tag(block, 'name') || 'YouTube',
      published: tag(block, 'published')
    };
  }).filter(item => item.id && item.title && /grand theft auto vi|vice city|gta vi/i.test(item.title));
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=240, stale-while-revalidate=60');
  const newsUrl = 'https://news.google.com/rss/search?q=GTA%206&hl=pt-BR&gl=BR&ceid=BR:pt-419';
  const videoUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6VcWc1rAoWdBCM0JxrRQ3A';
  const [newsResult, videoResult] = await Promise.allSettled([fetchText(newsUrl), fetchText(videoUrl)]);
  const news = newsResult.status === 'fulfilled' ? parseNews(newsResult.value) : [];
  const fallbackVideos = [
    { id: 'T95WGWkx7P0', title: 'Grand Theft Auto VI Now Available', channel: 'Rockstar Games', published: '2026-11-19T13:59:56+00:00' },
    { id: 'rz1B4B2yBZY', title: 'Grand Theft Auto VI Launch Trailer', channel: 'Rockstar Games', published: '2026-10-15T13:00:26+00:00' },
    { id: 'tJbzMqJGH4k', title: 'Grand Theft Auto VI: An Extended Look', channel: 'Rockstar Games', published: '2026-08-27T21:00:48+00:00' },
    { id: 'VQRLujxTm3c', title: 'Grand Theft Auto VI Trailer 2', channel: 'Rockstar Games', published: '2025-05-06T00:00:00+00:00' },
    { id: 'QdBZY2fkU-0', title: 'Grand Theft Auto VI Trailer 1', channel: 'Rockstar Games', published: '2023-12-04T00:00:00+00:00' }
  ];
  const liveVideos = videoResult.status === 'fulfilled' ? parseVideos(videoResult.value) : [];
  const videos = liveVideos.length ? liveVideos : fallbackVideos;
  res.status(200).json({ updatedAt: new Date().toISOString(), news, videos, sources: ['Google News RSS', 'YouTube RSS'] });
};
