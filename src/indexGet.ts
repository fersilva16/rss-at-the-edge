import { Context } from 'hono';
import * as cheerio from 'cheerio';

export const indexGet = async ({ req }: Context) => {
	const { url } = req.query();

	try {
		if (!url) {
			return new Response('No URL provided', {
				status: 400,
				headers: {
					'content-type': 'text/plain',
				},
			});
		}

		const response = await fetch(url, {
			headers: {
				'User-Agent': 'rss-at-the-edge/0.1',
			},
		});

		if (!response.ok) {
			return new Response(`Failed to fetch URL: ${response.status} ${response.statusText}`, {
				status: response.status,
				headers: {
					'content-type': 'text/plain',
				},
			});
		}

		const contentType = response.headers.get('content-type') || '';

		if (!contentType.includes('html')) {
			return new Response('Unsupported content type: ' + contentType, {
				status: 400,
				headers: {
					'content-type': 'text/plain',
				},
			});
		}

		const html = await response.text();

		const $ = cheerio.load(html);

		const rssLink = $('link[type="application/rss+xml"], link[type="application/atom+xml"]').first().attr('href');

		const parsedUrl = new URL(url);
		const currentUrl = new URL(req.url);

		const isYoutube = parsedUrl.hostname.includes('youtube.com');

		if (isYoutube) {
			return Response.redirect(`${currentUrl.origin}/youtube/${parsedUrl.searchParams.get('channel_id')}`, 302);
		}

		return new Response(rssLink || '', {
			headers: {
				'content-type': 'text/plain',
			},
		});
	} catch (error) {
		return new Response(`Error processing URL: ${error}`, {
			status: 400,
			headers: {
				'content-type': 'text/plain',
			},
		});
	}
};
