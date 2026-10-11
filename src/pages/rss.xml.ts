import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { AUTHOR, EMAIL, SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { getPosts, postUrl } from '../lib/posts';

export async function GET(context: APIContext) {
  const posts = (await getPosts()).filter((post) => !post.data.draft);
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: postUrl(post),
      categories: post.data.tags,
      author: `${EMAIL} (${AUTHOR})`,
    })),
    customData: '<language>en-us</language>',
  });
}
