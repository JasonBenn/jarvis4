import { readFileSync } from 'fs';
import { marked } from 'marked';

const READWISE_TOKEN = process.env.READWISE_TOKEN;
const FILE_PATH = process.env.HOME + '/notes/Recent Thoughts.md';

if (!READWISE_TOKEN) {
  console.error('Error: READWISE_TOKEN environment variable not set');
  console.error('Get your token from: https://readwise.io/access_token');
  process.exit(1);
}

async function uploadToReadwise() {
  // Read the markdown file
  const markdown = readFileSync(FILE_PATH, 'utf-8');

  // Convert markdown to HTML
  const html = await marked(markdown);

  // Upload to Readwise Reader
  const response = await fetch('https://readwise.io/api/v3/save/', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${READWISE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: `file://${FILE_PATH}`,
      html: html,
      title: 'Recent Thoughts',
      tags: ['now-reading'],
      category: 'article',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${response.status} ${error}`);
  }

  const result = await response.json();
  console.log('✅ Successfully uploaded to Readwise Reader');
  console.log('Document ID:', result.id);
  console.log('URL:', result.url);
}

uploadToReadwise().catch(console.error);
