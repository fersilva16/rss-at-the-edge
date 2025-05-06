import { Hono } from 'hono';
import { cache } from 'hono/cache';

import { youtubeGet } from './youtubeGet';
import { mangadexGet } from './mangadexGet';

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

app.get('/youtube/:channelId', youtubeGet);

app.get('/mangadex/:id', mangadexGet);

app.notFound((c) => new Response('Not found', { status: 404 }));

app.onError((err, c) => {
	console.error(err);
	return c.text('Internal server error', 500);
});

export default app;
