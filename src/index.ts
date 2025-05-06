import RSS, { ItemOptions } from 'rss';
import { Hono } from 'hono';
import { cache } from 'hono/cache';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { google } from 'googleapis';
import { parse, toSeconds } from 'iso8601-duration';
import { batch } from './batch';

const xmlParser = new XMLParser({ ignoreAttributes: false });
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false });

type Bindings = {
	kv: KVNamespace;
	YOUTUBE_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
	'*',
	cache({
		cacheName: 'rss-at-the-edge',
		cacheControl: 'max-age=86400', // 1 day
	})
);

const extractVideoId = (url: string): string | null => {
	return new URL(url).searchParams.get('v');
};

const getCacheKey = (videoId: string): string => {
	return `youtube-${videoId}`;
};

const MAX_DURATION = 180;

app.get('/youtube/:channelId', async ({ req, env }) => {
	const { channelId } = req.param();

	const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);

	if (!response.ok) {
		return new Response('Not found', { status: 404 });
	}

	const youtube = google.youtube({ version: 'v3', auth: env.YOUTUBE_API_KEY });

	const result = await response.text();
	const xml = xmlParser.parse(result);

	const durationMap = new Map<string, number>();
	let idsToFetch: string[] = [];

	await Promise.all(
		xml.feed.entry.map(async (entry: any) => {
			const url = entry.link['@_href'];
			const videoId = extractVideoId(url);

			if (!videoId) {
				return;
			}

			const cacheKey = getCacheKey(videoId);
			const cached = await env.kv.get(cacheKey);

			if (cached) {
				durationMap.set(url, parseInt(cached, 10));

				return;
			}

			idsToFetch.push(videoId);
		})
	);

	let pageToken: string | undefined;

	do {
		const { data } = await youtube.videos.list({
			part: ['contentDetails'],
			id: idsToFetch,
			maxResults: 50,
			pageToken,
		});

		if (!data.items) {
			break;
		}

		console.log(data);

		await Promise.all(
			data.items.map(async (item) => {
				if (!item.contentDetails?.duration || !item.id) {
					return;
				}

				const duration = toSeconds(parse(item.contentDetails.duration));

				durationMap.set(item.id, duration);

				const cacheKey = getCacheKey(item.id);

				await env.kv.put(cacheKey, duration.toString(), {
					expirationTtl: 2592000, // 30 days
				});
			})
		);

		if (data.nextPageToken) {
			pageToken = data.nextPageToken;
		}
	} while (pageToken);

	const filteredEntries = xml.feed.entry.filter((entry: any) => {
		const url = entry.link['@_href'];

		const duration = durationMap.get(url);

		if (!duration) {
			return true;
		}

		if (duration >= MAX_DURATION) {
			return true;
		}

		return false;
	});

	const newXml = {
		...xml,
		feed: {
			...xml.feed,
			entry: filteredEntries,
		},
	};

	const output = xmlBuilder.build(newXml);

	return new Response(output, {
		headers: {
			'content-type': 'text/xml',
		},
	});
});

app.get('/mangadex/:id', async (c) => {
	const { id } = c.req.param();

	const detailsResponse = await fetch(`https://api.mangadex.org/manga/${id}`, {
		headers: {
			'user-agent': 'rss-at-the-edge/0.1',
		},
	});

	if (!detailsResponse.ok) {
		return new Response('Not found', { status: 404 });
	}

	const searchParams = new URLSearchParams({
		'order[volume]': 'desc',
		'order[chapter]': 'desc',
	});

	const feedResponse = await fetch(`https://api.mangadex.org/manga/${id}/feed?${searchParams}`, {
		headers: {
			'user-agent': 'rss-at-the-edge/0.1',
		},
	});

	if (!feedResponse.ok) {
		return new Response('Not found', { status: 404 });
	}

	const details = (await detailsResponse.json()) as any;
	const feed = (await feedResponse.json()) as any;

	const enFeed = feed.data.filter((chapter: any) => chapter.attributes.translatedLanguage === 'en') as any[];

	const getDescription = (chapter: any) => {
		if (!chapter.attributes.volume) {
			return `Ch. ${chapter.attributes.chapter}`;
		}

		return `Vol. ${chapter.attributes.volume}, Ch. ${chapter.attributes.chapter}`;
	};

	const chapters = enFeed.map<ItemOptions>((chapter) => ({
		title: chapter.attributes.title,
		date: chapter.attributes.readableAt,
		url: `https://mangadex.org/chapter/${chapter.id}`,
		description: getDescription(chapter),
		categories: [],
	}));

	const rss = new RSS(
		{
			site_url: `https://mangadex.org/title/${details.data.id}`,
			feed_url: `https://mangadex.org/title/${details.data.id}`,
			title: details.data.attributes.title.en,
			description: details.data.attributes.description.en,
		},
		chapters
	);

	return new Response(rss.xml(), {
		headers: {
			'content-type': 'text/xml',
		},
	});
});

app.notFound((c) => new Response('Not found', { status: 404 }));

export default app;
