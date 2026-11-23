const USER_AGENT = 'GTA6Radar/1.0 (+https://gta6-radar-br.vercel.app)';

function decodeXml(value = '') {
  return value
    .replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim();
}
function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\\\s[^>]*)?>([\\\\s\\\\S]*?)<\\\\/${name}>`, 'i');
  return decodeXml(block.match(re)?.[1] || '');
}
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, 'accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}
function parseNews(xml) {
  return [...xml.matchAll(/<item\\b[\\s\\S]*?<\\/item>/gi)].slice(0, 12).map(m => {
    const block = m[0];
    return { title: tag(block, 'title'), link: tag(block, 'link'), published: tag(block, 'pubDate'), source: tag(block, 'source') || 'Notícias GTA VI' };
  }).filter(x => x.title && x.link);
}
function parseVideos(xml) {
  return [...xml.matchAll(/<entry\\b[\\s\\S]*?<\\/entry>/gi)].slice(0, 12).map(m => {
    const block = m[0];
    const id = tag(block, 'yt:videoId');
    return { id, title: tag(block, 'title'), channel: tag(block, 'name') || 'YouTube', published: tag(block, 'published') };
  }).filter(x => x.id && x.title);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=240, stale-while-revalidate=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const newsUrl = 'https://news.google.com/rss/search?q=GTA%206&hl=pt-BR&gl=BR&ceid=BR:pt-419';
  const videoUrl = 'https://www.youtube.com/feeds/videos.xml?search_query=GTA+6';
  const [newsResult, videoResult] = await Promise.allSettled([fetchText(newsUrl), fetchText(videoUrl)]);
  const news = newsResult.status === 'fulfilled' ? parseNews(newsResult.value) : [];
  const videos = videoResult.status === 'fulfilled' ? parseVideos(videoResult.value) : [];
  res.status(200).json({ updatedAt: new Date().toISOString(), news, videos, sources: ['Google News RSS', 'YouTube RSS'] });
};
