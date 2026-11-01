import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownView } from './tsx_server/components/MarkdownView';
import fs from 'fs';
const md = fs.readFileSync('/home/vovan/NSU/Buisness-projects/ТАКТ 3/docs/GUIDE.md', 'utf-8') + '\n\n[текст](https://example.com) <script>x</script>';
const html = renderToStaticMarkup(React.createElement(MarkdownView, { source: md }));
const checks = { h1: '<h1', h2: '<h2', h3: '<h3', strong: '<strong', em: '<em>', code: '<code', pre: '<pre', blockquote: '<blockquote', list: '<ul', link: '<a href="https://example.com"', hr: '<hr', noXss: !html.includes('<script>') };
for (const [k, v] of Object.entries(checks)) console.log(v ? 'OK  ' : 'FAIL', k);
