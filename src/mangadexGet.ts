import { Context } from 'hono';
import RSS, { ItemOptions } from 'rss';

export const mangadexGet = async ({ req }: Context) => {
	const { id } = req.param();

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
};
