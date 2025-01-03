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

router.all('*', () => new Response('Not found', { status: 404 }));

export default {
	async fetch(request): Promise<Response> {
		return await router.fetch(request);
	},
} satisfies ExportedHandler<Env>;
