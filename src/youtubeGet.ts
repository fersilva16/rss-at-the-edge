import { Context } from 'hono';
import { google } from 'googleapis';
import { parse, toSeconds } from 'iso8601-duration';
import { xmlBuilder, xmlParser } from './xml';

const getCacheKey = (videoId: string): string => {
	return `youtube-${videoId}`;
};

const MIN_DURATION = 180;

export const youtubeGet = async ({ req, env }: Context) => {
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
			const videoId = entry['yt:videoId'];

			const cacheKey = getCacheKey(videoId);
			const cached = await env.kv.get(cacheKey);

			if (cached) {
				durationMap.set(videoId, parseInt(cached, 10));

				return;
			}

			idsToFetch.push(videoId);
		})
	);

	let pageToken: string | undefined;

	do {
		if (idsToFetch.length === 0) {
			break;
		}

		const { data } = await youtube.videos.list({
			part: ['contentDetails'],
			id: idsToFetch,
			maxResults: 50,
			pageToken,
		});

		if (!data.items) {
			break;
		}

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
		const videoId = entry['yt:videoId'];
		const duration = durationMap.get(videoId);

		if (!duration) {
			return true;
		}

		return duration >= MIN_DURATION;
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
};
