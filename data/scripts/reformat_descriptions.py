import io, sys, pandas as pd, re, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

xl = pd.ExcelFile('data/products_master_v25.xlsx')
SHEETS = ['K-Medical', 'K-Beauty', 'K-Wellness', 'K-Starcation', 'K-Education', 'Subpackage']
SPA_SKIP = {'#P-201', '#P-202', '#P-203', '#P-204', '#P-205', '#P-206', '#P-207'}

# Typo fixes (apply globally — content-preserving cleanup only)
TYPO_FIXES = [
    ('Dental Clinc', 'Dental Clinic'),
    ('Lung([hest', 'Lung (Chest'),
    ('SPick 1', 'Pick 1'),
    ('Dental Assessmen\n', 'Dental Assessment\n'),
    ('Dental Assessmen$', 'Dental Assessment'),
    ('Custermize', 'Customize'),
    ('VP Premium', 'VIP Premium'),
    ('Uninalysis', 'Urinalysis'),
    ('Creatnine', 'Creatinine'),
    ('Primier Suite Doblue', 'Premier Suite Double'),
    ('Park coner Suite', 'Park Corner Suite'),
    ('Coner Suite', 'Corner Suite'),
    ('Seul Songpa-gu', 'Seoul Songpa-gu'),
    ('Trevel Easy', 'Travel Easy'),
    ('Gwangak-gu', 'Gwanak-gu'),
    ('Custermize', 'Customize'),
]


def apply_typo_fixes(text):
    if not isinstance(text, str):
        return text
    for old, new in TYPO_FIXES:
        text = re.sub(old, new, text) if old.endswith('$') else text.replace(old, new)
    return text


def sval(v):
    if v is None:
        return None
    if isinstance(v, float) and pd.isna(v):
        return None
    s = str(v).strip()
    return s if s else None


def smart_clean(text):
    return (text.replace('\r\n', '\n').replace('\r', '\n')
                .replace('’', "'").replace('‘', "'")
                .replace('“', '"').replace('”', '"'))


def collapse_ws(s):
    """Collapse 2+ spaces into 1 (preserves leading whitespace decisions made by caller)."""
    return re.sub(r'  +', ' ', s)


def split_inline_bullets(line):
    """Split on inline `•` or `·` (middle dot) separators when 2+ present."""
    count = line.count('•') + line.count('·')
    if count < 2:
        return [line.strip()]
    parts = re.split(r'[•·]', line)
    return [collapse_ws(p.strip()) for p in parts if p.strip()]


def paren_aware_split(text, sep):
    """Split text on sep but only when sep occurs at paren-depth 0."""
    out, buf, depth = [], [], 0
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == '(':
            depth += 1
            buf.append(ch)
        elif ch == ')':
            depth = max(0, depth - 1)
            buf.append(ch)
        elif ch == sep and depth == 0:
            out.append(''.join(buf))
            buf = []
        else:
            buf.append(ch)
        i += 1
    if buf:
        out.append(''.join(buf))
    return out


def collect_paragraph_block(lines, idx):
    """Collect consecutive non-empty plain-text lines into a single paragraph string,
    starting at idx. Returns (joined_text, end_idx). Stops at blank line, ★, ▶."""
    pieces = []
    i = idx
    while i < len(lines):
        s = lines[i].strip()
        if not s:
            break
        if s.startswith('★') or s.startswith('▶'):
            break
        pieces.append(s)
        i += 1
    return ' '.join(pieces), i


def normalize_existing(desc):
    """Description already has ★/▶ structure. Normalize indent + split inline `•`."""
    text = smart_clean(desc)
    lines = [ln.rstrip() for ln in text.split('\n')]

    out = []
    i = 0
    while i < len(lines):
        s = lines[i].lstrip().rstrip()
        if not s:
            if out and out[-1] != '':
                out.append('')
            i += 1
            continue
        if s.startswith('★'):
            out.append('★ ' + collapse_ws(s[1:].lstrip()))
            i += 1
            continue
        if s.startswith('▶'):
            head = s[1:].lstrip()
            # If header line itself has inline `•`, treat the part before first `•` as section name
            if '•' in head:
                cut = head.index('•')
                section = head[:cut].rstrip()
                rest = head[cut:]
                if section:
                    out.append('   ▶ ' + collapse_ws(section))
                # join any continuation paragraph lines under this section
                para_text = rest
                tail, j = collect_paragraph_block(lines, i + 1)
                if tail:
                    para_text = para_text + ' ' + tail
                    i = j
                else:
                    i += 1
                items = split_inline_bullets(para_text)
                for it in items:
                    if it:
                        out.append('      • ' + it)
                continue
            else:
                out.append('   ▶ ' + collapse_ws(head))
                i += 1
                continue
        if s.startswith('*') and not s.startswith('**'):
            content = s[1:].lstrip()
            if '•' in content:
                for it in split_inline_bullets(content):
                    if it:
                        out.append('      • ' + it)
            else:
                out.append('      • ' + collapse_ws(content))
            i += 1
            continue
        if s.startswith('•') or s.startswith('·'):
            content = s.lstrip('•·').lstrip()
            # Glue with continuation lines (until blank or ★/▶), then split inline `•`
            tail, j = collect_paragraph_block(lines, i + 1)
            if tail:
                content = content + ' ' + tail
                i = j
            else:
                i += 1
            for it in split_inline_bullets(content):
                if it:
                    out.append('      • ' + it)
            continue
        # Plain paragraph line — gather full paragraph then split on bullets/separators
        para, j = collect_paragraph_block(lines, i)
        i = j
        if '•' in para:
            for it in split_inline_bullets(para):
                if it:
                    out.append('      • ' + it)
        elif para.count(';') >= 2:
            for piece in paren_aware_split(para, ';'):
                p = piece.strip(' ,;+')
                if p:
                    out.append('      • ' + collapse_ws(p))
        elif paren_aware_split(para, '+').__len__() >= 4 and len(para) > 60:
            # `+` separated inline run, paren-aware (4+ pieces to avoid false splits)
            for piece in paren_aware_split(para, '+'):
                p = piece.strip(' ,;+')
                if p:
                    out.append('      • ' + collapse_ws(p))
        else:
            out.append('      ' + collapse_ws(para))

    cleaned, prev_blank = [], True
    for ln in out:
        if not ln.strip():
            if not prev_blank:
                cleaned.append('')
                prev_blank = True
        else:
            cleaned.append(ln)
            prev_blank = False
    return '\n'.join(cleaned)


def reformat_bullet_list(desc):
    text = smart_clean(desc)
    out = []
    for ln in text.split('\n'):
        s = ln.lstrip().rstrip()
        if not s:
            continue
        if s.startswith('*') and not s.startswith('**'):
            out.append('      • ' + s[1:].lstrip())
        elif s.startswith('•') or s.startswith('·'):
            out.append('      • ' + s.lstrip('•·').lstrip())
        else:
            out.append('      • ' + s)
    return '\n'.join(out)


def reformat_inline_run(desc, day_pattern=False):
    text = smart_clean(desc).strip()
    if day_pattern:
        m = list(re.finditer(r'Day\s*(\d+)\s*:', text))
        if m:
            out = []
            pre = text[:m[0].start()].strip(' ;')
            if pre:
                for piece in re.split(r'[;]+', pre):
                    p = piece.strip(' ;,')
                    if p:
                        out.append('      • ' + p)
            for i, mm in enumerate(m):
                end = m[i + 1].start() if i + 1 < len(m) else len(text)
                body = text[mm.end():end].strip(' ;,')
                stops = [x.strip(' ;,→') for x in re.split(r'[→;]', body) if x.strip(' ;,→')]
                out.append('   ▶ Day ' + mm.group(1))
                for st in stops:
                    out.append('      • ' + st)
            return '\n'.join(out)
    parts = []
    if text.count(';') >= 1:
        parts = [p.strip(' ;,') for p in text.split(';') if p.strip(' ;,')]
    elif text.count('+') >= 2:
        parts = [p.strip() for p in text.split('+') if p.strip()]
    else:
        parts = [text]
    return '\n'.join('      • ' + p for p in parts)


def has_pattern_day(desc):
    return bool(re.search(r'Day\s*\d+\s*:', desc or ''))


def has_star_already(desc):
    if not desc:
        return False
    return any(ln.lstrip().startswith('★') for ln in desc.split('\n'))


def is_bullet_list(desc):
    if not desc:
        return False
    lines = [ln.strip() for ln in desc.split('\n') if ln.strip()]
    if not lines:
        return False
    bullets = sum(1 for ln in lines if ln.startswith('*') or ln.startswith('•') or ln.startswith('·'))
    return bullets >= len(lines) * 0.6


def reformat(desc):
    if not desc:
        return '(no description)'
    desc = apply_typo_fixes(desc)
    if has_star_already(desc):
        return normalize_existing(desc)
    if has_pattern_day(desc):
        return reformat_inline_run(desc, day_pattern=True)
    if is_bullet_list(desc):
        return reformat_bullet_list(desc)
    return reformat_inline_run(desc)


def build_headers(r):
    lines = []
    name = sval(r.get('name'))
    if name:
        lines.append('★ ' + apply_typo_fixes(name))
    loc = sval(r.get('location'))
    if loc:
        lines.append('★ Location : ' + apply_typo_fixes(loc))
    dv = r.get('duration_value')
    du = sval(r.get('duration_unit'))
    if pd.notna(dv) and dv:
        try:
            dv_int = int(dv) if float(dv).is_integer() else dv
        except Exception:
            dv_int = dv
        if du:
            lines.append('★ Duration : ' + str(dv_int) + ' ' + du)
        else:
            lines.append('★ Duration : ' + str(dv_int))
    vl = sval(r.get('variant_label'))
    if vl:
        lines.append('★ Grade : ' + apply_typo_fixes(vl))
    return '\n'.join(lines)


path = 'data/product_descriptions.txt'
with open(path, 'w', encoding='utf-8') as f:
    f.write('# Product Descriptions (정리본)\n')
    f.write('# Source: data/products_master_v25.xlsx\n')
    f.write('# K-Wellness SPA & Aesthetic (#P-201~207)는 이사님 작업본 그대로 보존\n')
    f.write('# 그 외: ★ 헤더는 v25 컬럼값만 사용, 본문은 원본 description 텍스트만 (단어 추가 X)\n')
    f.write('# 오탈자 일괄 fix: Clinc/[hest/SPick/Assessmen/Custermize/VP→VIP/Uninalysis/Creatnine/Primier/Coner/Seul/Trevel/Gwangak\n\n')
    total = 0
    for sheet in SHEETS:
        df = pd.read_excel(xl, sheet_name=sheet)
        df = df.sort_values(by=['secondary_category', 'partner_name', 'product_number'], na_position='last')
        f.write('\n' + ('#' * 70) + '\n# ' + sheet + ' (' + str(len(df)) + '개)\n' + ('#' * 70) + '\n')
        cur_sub = None
        for _, r in df.iterrows():
            sub = sval(r.get('secondary_category')) or '(no subcategory)'
            if sub != cur_sub:
                f.write('\n' + ('-' * 60) + '\n-- ' + sub + '\n' + ('-' * 60) + '\n')
                cur_sub = sub
            pn = r['product_number']
            heading_name = apply_typo_fixes(str(r.get('name') or ''))
            heading_partner = apply_typo_fixes(str(r.get('partner_name') or '-'))
            f.write('\n=== ' + pn + ' | ' + heading_name + ' | ' + heading_partner + ' ===\n')
            if pn in SPA_SKIP:
                f.write('# (SPA & Aesthetic — 이사님 작업본 그대로)\n')
                desc = r.get('description')
                f.write(desc if isinstance(desc, str) else '(no description)')
                f.write('\n')
                total += 1
                continue
            desc = r.get('description')
            # If body already has ★ headers, let body be authoritative — skip column headers
            if has_star_already(desc):
                body = reformat(desc)
                f.write(body + '\n')
            else:
                headers = build_headers(r)
                if headers:
                    f.write(headers + '\n')
                body = reformat(desc)
                f.write(body + '\n')
            total += 1
    f.write('\n# Total: ' + str(total) + ' products\n')

print('Wrote', path, '(' + str(os.path.getsize(path)) + ' bytes,', total, 'products)')
