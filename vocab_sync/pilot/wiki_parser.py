"""Extract text-only lexical data from MediaWiki's expanded HTML, never execute it."""
import re
from html.parser import HTMLParser
from urllib.parse import quote


class Node:
    def __init__(self, tag='', attrs=(), parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def text(self, skip=(), reading=False):
        if self.has('defdate'):
            return ''
        if self.tag == 'br':
            return ' / '
        if self.tag in {'script', 'style', 'sup', 'rp'} | set(skip):
            return ''
        if self.tag == 'rt' and not reading:
            return ''
        if self.tag == 'ruby' and reading:
            rt = [n.text(reading=True) for n in self.walk() if n.tag == 'rt']
            if rt:
                return ''.join(rt)
        return ''.join(c if isinstance(c, str) else c.text(skip, reading) for c in self.children)

    def has(self, cls):
        return cls in self.attrs.get('class', '').split()


class Tree(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = self.current = Node()
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.current)
        self.current.children.append(n)
        if tag not in {'br', 'hr', 'img', 'input', 'link', 'meta', 'wbr', 'source', 'col'}:
            self.current = n

    def handle_endtag(self, tag):
        n = self.current
        while n.parent:
            if n.tag == tag:
                self.current = n.parent
                return
            n = n.parent

    def handle_data(self, data):
        self.current.children.append(data)


def clean(text):
    return re.sub(r'\s+', ' ', text).strip()


def ancestor(node, tag):
    n = node.parent
    while n:
        if n.tag == tag:
            return n
        n = n.parent
    return None


POS = {'名詞', '名词', '動詞', '动词', '形容詞', '形容词', '副詞', '副词',
       '代名詞', '代词', '介詞', '介词', '助詞', '助词', '連詞', '连词',
       '感嘆詞', '感叹词', '嘆詞', '叹词', '數詞', '数词', '冠詞', '冠词', '專有名詞', '专有名词',
       '代詞', '前置詞', '前置词', '量詞', '量词', '短語', '短语', '熟語', '熟语'}
LANGUAGES = {'ja': {'日語', '日语'}, 'de': {'德語', '德语'}}
FORM_SECTIONS = {'活用', '變位', '变位', '變格', '变格', '屈折', '詞形變化', '词形变化'}


def examples(li, language, convert):
    result = []
    for n in li.walk():
        if n.attrs.get('lang') != language or n.tag not in {'span', 'i'}:
            continue
        if ancestor(n, 'li') is not li or any(p.has('nyms') for p in parents(n, li)):
            continue
        # Only usage examples inside a definition list, not isolated linked words.
        scope = ancestor(n, 'dd')
        if not scope or any(p.attrs.get('lang') == language for p in parents(n, scope)):
            continue
        text = clean(n.text())
        if not text or any(e['text'] == text for e in result):
            continue
        translations = [clean(x.text()) for x in scope.walk() if x.has('e-translation')]
        if not translations:
            translations = [clean(x.text()) for x in scope.walk()
                            if x.tag == 'dd' and x is not scope
                            and not any(y.attrs.get('lang') for y in x.walk())
                            and re.search(r'[\u3400-\u9fff]', x.text())]
        translation = convert(translations[-1]) if translations else ''
        result.append({'text': text, 'translation': translation,
                       'translationLanguage': 'zh' if translation else '', 'ref': '中文維基詞典'})
    return result


def parents(node, stop):
    n = node.parent
    while n and n is not stop:
        yield n
        n = n.parent


def table_data(table, language, convert):
    rows = []
    for row in table.walk():
        if row.tag != 'tr' or ancestor(row, 'table') is not table:
            continue
        cells = []
        for cell in row.children:
            if not isinstance(cell, Node) or cell.tag not in {'th', 'td'}:
                continue
            # Convert explanatory text only; preserve Japanese/German spelling and ruby.
            def cell_text(n):
                if n.tag == 'br':
                    return ' / '
                if n.attrs.get('lang') == language:
                    return n.text()
                if n.tag in {'script', 'style', 'rt', 'rp', 'sup'}:
                    return ''
                return ''.join(convert(c) if isinstance(c, str) else cell_text(c) for c in n.children)
            value = clean(cell_text(cell))
            if cell.tag == 'th':
                labels = {'敬體': 'ます形（禮貌形）', '敬体': 'ます形（禮貌形）',
                          '接續': 'て形（連接形）', '接续': 'て形（連接形）',
                          '完成': 'た形（過去／完成）', '否定': '否定形', '被動': '被動形', '使役': '使役形', '可能': '可能形'} if language == 'ja' else {'i': '虛擬一式', 'ii': '虛擬二式'}
                value = labels.get(value, value)
            person = ''
            if language == 'de' and cell.tag == 'td':
                pronoun = value.split(' ', 1)[0]
                person = {'ich': '第一人稱單數', 'du': '第二人稱單數', 'er': '第三人稱單數',
                          'es': '第三人稱單數', 'wir': '第一人稱複數', 'ihr': '第二人稱複數', 'Sie': '敬稱'}.get(pronoun, '')
            cells.append({'text': value, 'person': person, 'header': cell.tag == 'th',
                          'colspan': span(cell, 'colspan'), 'rowspan': span(cell, 'rowspan')})
        if cells:
            rows.append(cells)
    return rows


def span(node, attr):
    value = node.attrs.get(attr, '1')
    return min(30, max(1, int(value))) if value.isdigit() else 1


def parse_entry(payload, language, convert=lambda s: s):
    page = payload.get('parse', {})
    html = page.get('text', '')
    if isinstance(html, dict):
        html = html.get('*', '')
    candidates, current, section, active = [], None, '', False
    source = {'name': '中文維基詞典', 'url': 'https://zh.wiktionary.org/w/index.php?oldid=' + str(page.get('revid', '')),
              'pageUrl': 'https://zh.wiktionary.org/wiki/' + quote(page.get('title', '')),
              'revision': page.get('revid'), 'licenseUrl': 'https://zh.wiktionary.org/wiki/Wiktionary:版权信息'}
    for n in Tree(html).root.walk():
        if n.tag == 'h2':
            active = clean(n.text()) in LANGUAGES.get(language, set())
            current, section = None, ''
        elif active and n.tag in {'h3', 'h4', 'h5'}:
            section = clean(n.text())
            if section in POS:
                current = {'lemma': page.get('title', ''), 'language': language, 'pos': [convert(section)], 'readings': [],
                           'senses': [], 'forms': [], 'formTables': [], 'source': source, 'match': '字典詞條'}
                candidates.append(current)
        elif active and current and section in POS and n.has('headword-line'):
            heads = [x for x in n.walk() if x.has('headword') and x.attrs.get('lang') == language]
            if heads:
                current['lemma'] = clean(heads[0].text())
                reading = clean(heads[0].text(reading=True))
                if language == 'ja' and reading and not re.search(r'[\u3400-\u9fff]', reading):
                    current['readings'] = [{'text': reading}]
            # Grammar remains source text; never run Chinese conversion on headword forms.
            current['grammar'] = clean(n.text())
        elif active and current and section in {'用法', '用法說明', '用法说明', '使用說明', '使用说明'} and n.tag == 'p':
            current['usage'] = (current.get('usage', '') + ' ' + clean(n.text())).strip()
        elif active and current and section in POS and n.tag == 'ol' and not ancestor(n, 'li'):
            for li in n.children:
                if not isinstance(li, Node) or li.tag != 'li':
                    continue
                gloss = clean(li.text(skip=('dl', 'ul', 'ol', 'table')))
                if gloss:
                    current['senses'].append({'glosses': [convert(gloss)], 'glossLanguage': 'zh',
                                              'examples': examples(li, language, convert),
                                              'related': [convert(clean(x.text())) for x in li.walk()
                                                          if x.has('nyms') and ancestor(x, 'li') is li]})
        elif active and current and section in FORM_SECTIONS and n.tag == 'table' and not any(x.tag == 'table' and x is not n for x in n.walk()):
            rows = table_data(n, language, convert)
            if rows:
                caption = next((clean(x.text()) for x in n.walk() if x.tag == 'caption'), '')
                title = rows[0][0]['text'] if len(rows[0]) == 1 and rows[0][0]['header'] else ''
                current['formTables'].append({'label': convert(caption or title or section), 'rows': rows})
    return [c for c in candidates if c['senses']]
