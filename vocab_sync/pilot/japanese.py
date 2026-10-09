"""Conservative four-form conjugation from confirmed JMdict POS, not spelling guesses."""
def conjugate(lemma, pos):
    codes = set(pos)
    text = ' '.join(pos).lower()
    forms = None
    if ('v1' in codes or 'ichidan verb' in text) and lemma.endswith('る'):
        stem = lemma[:-1]
        forms = [stem + s for s in ('ます', 'て', 'ない', 'た')]
    elif ('vs-i' in codes or 'suru verb - included' in text) and lemma.endswith('する'):
        stem = lemma[:-2]
        forms = [stem + s for s in ('します', 'して', 'しない', 'した')]
    elif ('vk' in codes or 'kuru verb' in text) and lemma in ('来る', 'くる'):
        forms = ['来ます', '来て', '来ない', '来た'] if lemma == '来る' else ['きます', 'きて', 'こない', 'きた']
    else:
        rules = {
            'う': ('v5u', 'い', 'わ', 'って', 'った'),
            'く': ('v5k', 'き', 'か', 'いて', 'いた'),
            'ぐ': ('v5g', 'ぎ', 'が', 'いで', 'いだ'),
            'す': ('v5s', 'し', 'さ', 'して', 'した'),
            'つ': ('v5t', 'ち', 'た', 'って', 'った'),
            'ぬ': ('v5n', 'に', 'な', 'んで', 'んだ'),
            'ぶ': ('v5b', 'び', 'ば', 'んで', 'んだ'),
            'む': ('v5m', 'み', 'ま', 'んで', 'んだ'),
            'る': ('v5r', 'り', 'ら', 'って', 'った'),
        }
        if lemma and lemma[-1] in rules:
            code, polite, negative, te, past = rules[lemma[-1]]
            endings = {'う':'u', 'く':'ku', 'ぐ':'gu', 'す':'su', 'つ':'tsu', 'ぬ':'nu', 'ぶ':'bu', 'む':'mu', 'る':'ru'}
            normal = code in codes or f"godan verb with '{endings[lemma[-1]]}' ending" in text
            iku = 'v5k-s' in codes or 'iku/yuku special class' in text
            aru = 'v5r-i' in codes or ('godan' in text and 'irregular verb' in text)
            if iku and lemma[-1] == 'く':
                te, past, normal = 'って', 'った', True
            if normal and not ('special class' in text and not iku):
                stem = lemma[:-1]
                forms = [stem + polite + 'ます', stem + te, stem + negative + 'ない', stem + past]
            if aru and lemma in ('ある', '有る', '在る'):
                forms = [lemma[:-1] + 'ります', lemma[:-1] + 'って', 'ない', lemma[:-1] + 'った']
    return [] if forms is None else [
        {'form': form, 'tags': [tag], 'source': 'rule:jmdict-pos-four-forms'}
        for tag, form in zip(('polite', 'te-form', 'negative', 'past'), forms)]
