import RSS, { ItemOptions } from 'rss';
import { Router, withParams, text } from 'itty-router';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const xmlParser = new XMLParser({ ignoreAttributes: false });
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false });

const router = Router({
	before: [withParams],
});

router.get('/youtube/:channelId', async ({ params }) => {
	const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${params.channelId}`);

	if (!response.ok) {
		return text('Not found');
	}

	const result = await response.text();

	const xml = xmlParser.parse(result);

	const newXml = {
		...xml,
		feed: {
			...xml.feed,
			entry: xml.feed.entry.filter(
				(entry: any) => !entry['media:group']['media:description'].includes('#shorts') && !entry.title.includes('#shorts')
			),
		},
	};

	const output = xmlBuilder.build(newXml);

	return new Response(output, {
		headers: {
			'content-type': 'text/xml',
		},
	});
});

router.get('/mangadex/:id', async ({ params }) => {
	const detailsResponse = await fetch(`https://api.mangadex.org/manga/${params.id}`, {
		headers: {
			'user-agent': 'rss-at-the-edge/0.1',
		},
	});

	if (!detailsResponse.ok) {
		return text('Not found');
	}

	const searchParams = new URLSearchParams({
		'order[volume]': 'desc',
		'order[chapter]': 'desc',
	});

	const feedResponse = await fetch(`https://api.mangadex.org/manga/${params.id}/feed?${searchParams}`, {
		headers: {
			'user-agent': 'rss-at-the-edge/0.1',
		},
	});

	if (!feedResponse.ok) {
		return text('Not found');
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

router.all('*', () => new Response('Not found', { status: 404 }));

export default {
	async fetch(request): Promise<Response> {
		return await router.fetch(request);
	},
} satisfies ExportedHandler<Env>;
