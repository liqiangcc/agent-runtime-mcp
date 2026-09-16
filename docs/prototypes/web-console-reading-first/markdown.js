// Minimal self-contained Markdown/GFM-ish renderer for the prototype.
// SECURITY: builds DOM via createElement/textContent only — never innerHTML.
// Links are scheme-whitelisted (http/https/mailto) and open with
// rel="noopener noreferrer"; everything else renders as plain text.
// No dependencies; production renderer choice is a Coordinator decision.
window.Md = (function () {
  const FENCE = /^```(\w*)\s*$/;
  const HEADING = /^(#{1,6})\s+(.*)$/;
  const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const QUOTE = /^>\s?(.*)$/;
  const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const TABLE_SEP = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;
  const TASK = /^\[( |x|X)\]\s+(.*)$/;

  // ---- block parsing ----
  function parseBlocks(src) {
    const lines = src.split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const start = i;
      const fm = line.match(FENCE);
      if (fm) {
        const buf = [];
        i++;
        while (i < lines.length && !FENCE.test(lines[i])) buf.push(lines[i++]);
        if (i < lines.length) i++; // consume closing fence
        blocks.push({ type: 'code', lang: fm[1] || '', text: buf.join('\n'), closed: i > start + buf.length + 1, raw: lines.slice(start, i).join('\n') });
        continue;
      }
      const hm = line.match(HEADING);
      if (hm) {
        blocks.push({ type: 'heading', level: hm[1].length, text: hm[2], raw: line });
        i++;
        continue;
      }
      if (HR.test(line)) {
        blocks.push({ type: 'hr', raw: line });
        i++;
        continue;
      }
      if (QUOTE.test(line)) {
        const buf = [];
        while (i < lines.length && QUOTE.test(lines[i])) buf.push(lines[i++].match(QUOTE)[1]);
        blocks.push({ type: 'quote', text: buf.join('\n'), raw: lines.slice(start, i).join('\n') });
        continue;
      }
      if (LIST.test(line)) {
        const items = [];
        while (i < lines.length && (LIST.test(lines[i]) || (/^\s+\S/.test(lines[i]) && items.length))) {
          const m = lines[i].match(LIST);
          if (m) items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
          else items[items.length - 1].text += '\n' + lines[i].trim(); // continuation
          i++;
        }
        blocks.push({ type: 'list', items, raw: lines.slice(start, i).join('\n') });
        continue;
      }
      // table: header row with |, then separator row
      if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
        const splitRow = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
        blocks.push({ type: 'table', head, rows, raw: lines.slice(start, i).join('\n') });
        continue;
      }
      if (!line.trim()) { i++; continue; }
      // paragraph: until blank line or a special block start
      const buf = [line];
      i++;
      while (i < lines.length && lines[i].trim() &&
             !FENCE.test(lines[i]) && !HEADING.test(lines[i]) && !HR.test(lines[i]) &&
             !QUOTE.test(lines[i]) && !LIST.test(lines[i]) &&
             !(lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))) {
        buf.push(lines[i++]);
      }
      blocks.push({ type: 'para', text: buf.join('\n'), raw: buf.join('\n') });
    }
    return blocks;
  }

  // ---- inline rendering (safe: DOM only) ----
  const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\([^)\n]+\))|(https?:\/\/[^\s<]+)/g;

  function safeHref(url) {
    return /^(https?:|mailto:)/i.test(url) ? url : null;
  }

  function renderInline(text, el) {
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      const tok = m[0];
      if (m[1]) {
        const c = document.createElement('code');
        c.className = 'md-code';
        c.textContent = tok.slice(1, -1);
        el.appendChild(c);
      } else if (m[2]) {
        const s = document.createElement('strong');
        renderInlineInner(s, tok.slice(2, -2));
        el.appendChild(s);
      } else if (m[3] || m[4]) {
        const s = document.createElement('em');
        s.textContent = tok.slice(1, -1);
        el.appendChild(s);
      } else if (m[5]) {
        const s = document.createElement('del');
        s.textContent = tok.slice(2, -2);
        el.appendChild(s);
      } else if (m[6]) {
        const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const href = safeHref(lm[2].trim());
        if (href) {
          const a = document.createElement('a');
          a.href = href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = lm[1];
          el.appendChild(a);
        } else {
          el.appendChild(document.createTextNode(tok));
        }
      } else if (m[7]) {
        const a = document.createElement('a');
        a.href = m[7];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = m[7];
        el.appendChild(a);
      }
      last = m.index + tok.length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderInlineInner(el, text) {
    el.appendChild(document.createTextNode(text));
  }

  // ---- block rendering ----
  function renderBlock(b) {
    switch (b.type) {
      case 'heading': {
        const h = document.createElement('h' + Math.min(b.level, 6));
        renderInline(b.text, h);
        return h;
      }
      case 'hr': return document.createElement('hr');
      case 'quote': {
        const q = document.createElement('blockquote');
        const p = document.createElement('div');
        renderInline(b.text, p);
        q.appendChild(p);
        return q;
      }
      case 'code': {
        // one rounded card: header (language + copy) over the pre; copy
        // writes the exact fenced text, never a re-rendered version
        const wrap = document.createElement('div');
        wrap.className = 'md-codeblock' + (b.closed === false ? ' streaming' : '');
        const head = document.createElement('div');
        head.className = 'md-codehead';
        const lang = document.createElement('span');
        lang.textContent = b.lang || 'Plain text';
        const copy = document.createElement('button');
        copy.type = 'button';
        const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        const label = document.createElement('span');
        label.textContent = 'Copy';
        copy.innerHTML = ICON;
        copy.appendChild(label);
        copy.addEventListener('click', () => {
          navigator.clipboard?.writeText(b.text).then(() => { label.textContent = 'Copied'; setTimeout(() => { label.textContent = 'Copy'; }, 1200); });
        });
        head.append(lang, copy);
        const pre = document.createElement('pre');
        pre.className = 'md-pre';
        const c = document.createElement('code');
        if (b.lang) c.className = 'lang-' + b.lang.replace(/[^\w-]/g, '');
        c.textContent = b.text;
        pre.appendChild(c);
        wrap.append(head, pre);
        return wrap;
      }
      case 'table': {
        const wrap = document.createElement('div');
        wrap.className = 'md-table';
        const t = document.createElement('table');
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        for (const cell of b.head) {
          const th = document.createElement('th');
          renderInline(cell, th);
          tr.appendChild(th);
        }
        thead.appendChild(tr);
        t.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const row of b.rows) {
          const tr = document.createElement('tr');
          for (let ci = 0; ci < b.head.length; ci++) {
            const td = document.createElement('td');
            if (row[ci] !== undefined) renderInline(row[ci], td);
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        t.appendChild(tbody);
        wrap.appendChild(t);
        return wrap;
      }
      case 'list': return renderList(b.items);
      default: {
        const p = document.createElement('p');
        renderInline(b.text, p);
        return p;
      }
    }
  }

  function renderList(items) {
    // build nested lists by indent
    const root = document.createElement(items[0].ordered ? 'ol' : 'ul');
    const stack = [{ el: root, indent: items[0].indent, li: null }];
    for (const it of items) {
      while (stack.length > 1 && it.indent < stack[stack.length - 1].indent) stack.pop();
      let top = stack[stack.length - 1];
      if (it.indent > top.indent && top.li) {
        const sub = document.createElement(it.ordered ? 'ol' : 'ul');
        top.li.appendChild(sub);
        stack.push({ el: sub, indent: it.indent, li: null });
        top = stack[stack.length - 1];
      }
      const li = document.createElement('li');
      const tm = it.text.match(TASK);
      if (tm) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.disabled = true;
        cb.checked = tm[1].toLowerCase() === 'x';
        li.appendChild(cb);
        li.appendChild(document.createTextNode(' '));
        li.className = 'task';
        renderInline(tm[2], li);
      } else {
        renderInline(it.text, li);
      }
      top.el.appendChild(li);
      top.li = li;
    }
    return root;
  }

  // ---- public API ----
  function renderInto(container, src) {
    container.textContent = '';
    container.classList.add('md');
    for (const b of parseBlocks(src)) container.appendChild(renderBlock(b));
  }

  // Incremental: completed blocks keep their DOM; only the changed
  // (generating tail) block re-renders. New blocks append once.
  function createLive(container) {
    container.classList.add('md');
    let raws = [];
    let nodes = [];
    function sync(src) {
      const blocks = parseBlocks(src);
      for (let i = 0; i < blocks.length; i++) {
        if (i < raws.length && raws[i] === blocks[i].raw) continue;
        const el = renderBlock(blocks[i]);
        if (i < nodes.length) {
          nodes[i].replaceWith(el);
          nodes[i] = el;
          raws[i] = blocks[i].raw;
        } else {
          container.appendChild(el);
          nodes.push(el);
          raws.push(blocks[i].raw);
        }
      }
      while (nodes.length > blocks.length) nodes.pop().remove(), raws.pop();
    }
    let acc = '';
    return {
      update(delta) { acc += delta; sync(acc); },
      setText(t) { acc = t; sync(acc); },
      done() { sync(acc); container.querySelectorAll('.md-codeblock.streaming').forEach(p => p.classList.remove('streaming')); },
    };
  }

  return { parseBlocks, renderInto, createLive };
})();
