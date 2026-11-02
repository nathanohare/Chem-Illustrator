#!/usr/bin/env python3
"""
One-off rename pass: invented UI names -> the standard Office / chemistry names (wording audit,
2026-11-02, approved list https://claude.ai/artifact/HgQqEUpUZYc8UHnsauCe4F).

Only user-facing text changes: string literals in src (never comments, command ids or file
formats), text and title/aria-label/placeholder attributes in index.html, and docs/guide.
Re-runnable: running it twice changes nothing the second time.

    python3 scripts/standard-names.py          # rewrite in place
    python3 scripts/standard-names.py --dry    # list what would change
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (pattern, replacement). Applied in order to every piece of user-facing text.
R = [
    # 1-6 Align (Office's Arrange menu names)
    (r'\bAlign ([Ll])eft [Ee]dges\b', r'Align \1eft'),
    (r'\bAlign ([Rr])ight [Ee]dges\b', r'Align \1ight'),
    (r'\bAlign ([Tt])op [Ee]dges\b', r'Align \1op'),
    (r'\bAlign ([Bb])ottom [Ee]dges\b', r'Align \1ottom'),
    (r'\bAlign ([Cc])ent(?:er|re)s [Aa]cross\b', r'Align \1enter'),
    (r'\bAlign ([Mm])iddles [Dd]own\b', r'Align \1iddle'),
    (r'buttons to line up left edges, cent(?:er|re)s, right edges, tops, middles and bottoms',
     '**Align Left**, **Align Center**, **Align Right**, **Align Top**, **Align Middle** and **Align Bottom**'),
    (r'\| Align left(?: edges)?, cent(?:er|re)s across, right edges \|', '| Align left, center, right |'),
    (r'\| Align top(?: edges)?, middles down, bottom edges \|', '| Align top, middle, bottom |'),
    (r'\balign, space evenly, flip\b', 'align, distribute, flip'),
    (r'\*\*Line up the text\*\*', '**Align the text**'),
    (r'\| Space evenly across, down \|', '| Distribute horizontally, vertically |'),
    (r'\| Flip left to right, flip top to bottom \|', '| Flip horizontal (left-right), flip vertical (top-bottom) |'),
    # 7-8 Distribute
    (r'\bSpace Evenly Across\b|\bSpace Across\b', 'Distribute Horizontally'),
    (r'\bSpace evenly across\b', 'Distribute horizontally'),
    (r'\bSpace Evenly Down\b|\bSpace Down\b', 'Distribute Vertically'),
    (r'\bSpace evenly down\b', 'Distribute vertically'),
    # 11, then 9-10 Flip
    (r'\bFlip Left to Right, Keeping Configuration\b', 'Flip Horizontal, Preserve Stereochemistry'),
    (r'\bFlip Top to Bottom, Keeping Configuration\b', 'Flip Vertical, Preserve Stereochemistry'),
    (r'\bFlip, Keeping Configuration\b', 'Flip, Preserve Stereochemistry'),
    (r'\bFlip Left to Right\b', 'Flip Horizontal (Left-Right)'),
    (r'\bFlip left to right\b', 'Flip horizontal (left-right)'),
    (r'\bFlip Top to Bottom\b', 'Flip Vertical (Top-Bottom)'),
    (r'\bFlip top to bottom\b', 'Flip vertical (top-bottom)'),
    # 12-15 Rotate
    (r'\bTurn (1|15|90)° ([Cc]lockwise|[Cc]ounterclockwise|[Aa]nticlockwise)', r'Rotate \1° \2'),
    (r'\bTurn in 3-D\b', '3-D Rotation'),
    (r'\bTurn in Perspective\b', 'Rotate in Perspective'),
    (r'\bTurning a structure in 3-D\b', 'Rotating a structure in 3-D'),
    (r'\bTurning a structure in perspective\b', 'Rotating a structure in perspective'),
    (r'#turning-a-structure-in-perspective\b', '#rotating-a-structure-in-perspective'),
    (r'\bMoving, turning and the Format menu\b', 'Moving, rotating and the Format menu'),
    (r'#moving-turning-and-the-format-menu\b', '#moving-rotating-and-the-format-menu'),
    (r'^### Turning text$', '### Rotating text'),
    (r'^### Turning$', '### Rotating'),
    # 16-23 Text, guides and animation
    (r'^Line up on the left$', 'Align Left'),
    (r'^Cent(?:er|re) the lines$', 'Center'),
    (r'^Line up on the right$', 'Align Right'),
    (r'^Stretch lines to both edges of the text box$', 'Justify'),
    (r'^Line up with other things \(smart guides\)$', 'Smart Guides'),
    (r'^Line up the numbers in each row$', 'Align numbers in each row'),
    (r'^(?:Take every guide away|Take away every guide)$', 'Clear All Guides'),
    (r'^Line (Down|Up|Left|Right)$', r'Lines: \1'),
    # 24-35 Windows, panels and dialogs
    (r'\bFold Side Panel\b', 'Collapse Side Panel'),
    (r'\bFold the side panel away\b', 'Collapse the side panel'),
    (r'\bFold on Short Windows\b', 'Auto-Collapse on Short Windows'),
    (r'\bFold the (side panel|ribbon)\b', r'Collapse the \1'),
    (r'^Open Out$', 'Expand'),
    (r'^Fold Up$', 'Collapse'),
    (r'^Fold this section$', 'Collapse Section'),
    (r'\b([Tt])ool tip(s?)\b', r'\1ooltip\2'),
    (r'\bGroup Tooltips\b', 'Chemical Abbreviation Tooltips'),
    (r'\bThe hint line at the bottom\b', 'The status bar'),
    (r'\bthe hint line\b', 'the status bar'),
    (r'^## Finding your way round$', '## Navigating the page'),
    (r'^## Getting round without the mouse$', '## Navigating with the keyboard'),
    (r'^Tick All$', 'Select All'),
    (r'^Tick None$', 'Deselect All'),
    (r'^Way up$', 'Orientation'),
    (r'^Keep Mine$', 'Keep My Version'),
    (r'^Open Theirs$', 'Open Their Version'),
    (r'^Reload \(Lose Mine\)$', 'Reload and Discard Mine'),
    (r'Keep Mine saves over theirs', 'Keep My Version saves over theirs'),
    (r'Open Theirs shows their version', 'Open Their Version shows their version'),
    (r'Keep Mine leaves', 'Keep My Version leaves'),
    (r'^Carry On$', 'Resume'),
    (r'\bPause or carry on the timer\b', 'Pause or resume the timer'),
    # 36-39 chemistry commands
    (r'\bH Atoms: Hide or Draw\b', 'Show/Hide Explicit Hydrogens'),
    (r'\bH atoms: hide or draw\b', 'Show/hide explicit hydrogens'),
    (r'\bShow Terminal Methyls \(or Hide\)', 'Show/Hide Terminal Methyls'),
    (r'\bShow terminal methyls \(or hide\)', 'Show/hide terminal methyls'),
    (r'\bAromatic Rings: Circle or Double Bonds\b', 'Aromatic Rings: Circle or Kekulé'),
    (r'\bAromatic rings: circle or double bonds\b', 'Aromatic rings: circle or Kekulé'),
    (r'\bBond Metal to Ring\b', 'Add Hapto Bond'),
    # 41-44 Style panel
    (r'^Unstick from shapes$', 'Detach from Shapes'),
    (r'^Unstick from structure$', 'Detach from Structure'),
    (r'^Unstick connector$', 'Detach Connector'),
    (r'^Tie to nearest structure$', 'Pin to Nearest Structure'),
    (r'^Untie from structure$', 'Unpin from Structure'),
    (r'^Untie caption$', 'Unpin Caption'),
    (r'^Tied descriptors$', 'Attached Descriptors'),
    (r'^Tied ID label$', 'Attached ID Label'),
    (r'^Tied to its structure$', 'Attached to Structure'),
    (r'^Work out again$', 'Reset to Automatic'),
    # 45 Highlight Style
    (r'\bHighlight Look(s?)\b', r'Highlight Style\1'),
    (r'\bhighlight look(s?)\b', r'highlight style\1'),
    (r"\bhighlight's look\b", "highlight's style"),
    # 46 import from pictures
    (r'^Read Structure from Picture…$', 'Import Structures from Picture…'),
    (r'^Read 1 Structure$', 'Import 1 Structure'),
    (r'^Read (\$\{n\}) Structures$', r'Import \1 Structures'),
    # 47 Rectangle
    (r'^Box$', 'Rectangle'),
    (r'^Box with round corners$', 'Rounded rectangle'),
    (r'^Box with a shadow$', 'Rectangle with shadow'),
    (r'^Round-cornered box with a shadow$', 'Rounded rectangle with shadow'),
    (r'^Dashed box$', 'Dashed rectangle'),
    # 48-56 Spreadsheet, Document and Presentation
    (r'\bSpot Formulas in Typed Text\b', 'AutoFormat Chemical Formulas'),
    (r'^Spot formulas in typed text$', 'AutoFormat chemical formulas'),
    (r'^Put in cells(…?)$', r'Insert into Cells\1'),
    (r'^Close up$', 'Collapse'),
    (r'^Close up tree$', 'Collapse tree'),
    (r'^Back to the whole$', 'Drill Up'),
    (r'^Put on Slide$', 'Insert on Slide'),
    (r'^Put Animation on Slide$', 'Insert Animation on Slide'),
    (r'^Make Style$', 'Create Style'),
    (r'^Make table$', 'Create Table'),
    (r'^Number again$', 'Renumber'),
    (r'^Enter by Hand$', 'Enter Manually'),
    (r'^Add by Hand…$', 'Add Manually…'),
    (r'^Your own size$', 'Custom Size'),
    (r'^Your own size: (height|width) \(in\)$', r'Custom size: \1 (in)'),
    (r'^Your own colou?rs…$', 'Custom Format…'),
    (r'^Your own look$', 'Custom Format'),
    (r'^Your own…$', 'Custom…'),
    (r'^Your own(?: look)?$', 'Custom'),
    # 61-64 American English
    (r'^Full stop$', 'Period'),
    (r'\bDistil\b', 'Distill'),
    (r'\b([Uu]n)?([Cc])atalysed\b', lambda m: (m.group(1) or '') + m.group(2) + 'atalyzed'),
    # 57 tick (a check box) -> check
    (r'\btick it or tick it off\b', 'check it or clear it'),
    (r'\btick it off\b', 'clear it'),
    (r'\bTick at least one\b', 'Select at least one'),
    (r'\b([Tt])ick which\b', lambda m: ('S' if m.group(1) == 'T' else 's') + 'elect which'),
    (r'\bticks which\b', 'checks which'),
    (r'\ba check box ticks at once\b', 'a check box is checked at once'),
    (r'\bTicks are for\b', 'Check marks are for'),
    (r'\bthe ticks are for\b', 'the check marks are for'),
    (r'✓  Tick\b', '✓  Check Mark'),
    (r'\bUntick(ed)?\b', lambda m: 'Cleared' if m.group(1) else 'Clear'),
    (r'\buntick(ed)?\b', lambda m: 'cleared' if m.group(1) else 'clear'),
    (r'\b([Tt])icked\b', lambda m: ('C' if m.group(1) == 'T' else 'c') + 'hecked'),
    (r'(?<!every )(?<!major )(?<!minor )(?<!from )(?<! to )(?<!mark )(?<!its )\b([Tt])ick\b(?! spacing)(?! to tick)',
     lambda m: ('C' if m.group(1) == 'T' else 'c') + 'heck'),
    # 58 round (meaning around) -> around; round handles, corners and brackets stay
    (r'\bround and round\b', 'around and around'),
    (r'(?<![-\w])(?<!How )round(?=,? (?:the|it|its|a|an|them|what|every|each|something|things|atom|labels|those|text|again|until|on itself|by itself|with|from|in a|arrows|anticlockwise|counterclockwise|so|one place|without)\b)', 'around'),
    (r'\b(way|turn|turns|turned|turning|swing|swings|walk|walks|look|Look|looking|Looking|go|Go|goes|going|move|moves|moving|all|curls|find|finds|swap|swaps|bonds|ring|arrows|side|it) round\b(?!-)', r'\1 around'),
    # 59-60 carry on, towards
    (r'\bcarry on typing\b', 'keep typing'),
    (r'\bCarry on\b', 'Continue'),
    (r'\bcarry on\b', 'continue'),
    (r'\bcarries on\b', 'continues'),
    (r'\bcarrying on\b', 'continuing'),
    (r'\b([Tt])owards\b', r'\1oward'),
    # 65 Abbreviation (ChemDraw's "nickname")
    (r'\bNicknames and Templates\b', 'Abbreviations and Templates'),
    (r'\bNickname(s?)\b', r'Abbreviation\1'),
    (r'\bnickname(s?)\b', r'abbreviation\1'),
    (r'\ba abbreviation\b', 'an abbreviation'),
    (r'\bA abbreviation\b', 'An abbreviation'),
    # 66 Keyboard Shortcuts (the window; one-key atom and bond keys stay "hotkeys")
    (r'\bEdit (▸|>) Hotkeys(…?)', r'Edit \1 Keyboard Shortcuts\2'),
    (r'^Hotkeys…$', 'Keyboard Shortcuts…'),
    (r'^Hotkeys$', 'Keyboard Shortcuts'),
    (r'\btool ?tips tooltips\b', 'tooltips'),
    (r'\bthe Hotkeys window\b', 'the Keyboard Shortcuts window'),
    (r'\bShow and change all hotkeys…', 'Show and change all keyboard shortcuts…'),
]
R = [(re.compile(p, re.M), r) for p, r in R]

# string literals that are ids, keys or code, never shown as they are
ID_LIKE = re.compile(r'^(?:atom|bond|fuse|hotspot|command|text) [a-z0-9-]+$|^[a-z0-9_.:/-]+$')


def fix(text: str) -> str:
    for p, r in R:
        text = p.sub(r, text)
    return text


LIT = re.compile(r"""'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`""")


def fix_ts(src: str) -> str:
    out, i = [], 0
    # skip comments: walk the file, copying comments as they are and fixing literals
    tok = re.compile(r"//[^\n]*|/\*.*?\*/|" + LIT.pattern + r"|/(?![/*])(?:[^/\\\n\[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+/[gimsuy]*", re.S)
    for m in tok.finditer(src):
        out.append(src[i:m.start()])
        s = m.group(0)
        if s[0] in '\'"`' and not ID_LIKE.match(s[1:-1]):
            q, body = s[0], s[1:-1]
            if q == '`':
                # leave ${…} untouched, fix the text around it
                parts = re.split(r'(\$\{[^}]*\})', body)
                body = ''.join(p if p.startswith('${') or not re.search(r'\s', p) else fix(p) for p in parts)
                # a whole template like `Read ${n} Structures`
                body = fix(body) if re.fullmatch(r'Read \$\{n\} Structures', body) else body
            else:
                body = fix(body)
            s = q + body + q
        out.append(s)
        i = m.end()
    out.append(src[i:])
    new = ''.join(out)
    # comments stay as written, even where a regex or division threw the scan off
    a, b = src.split('\n'), new.split('\n')
    if len(a) == len(b):
        b = [x if x != y and (x.lstrip().startswith(('//', '*', '/*')) or any(k in x for k in KEEP_LINES)) else y for x, y in zip(a, b)]
        new = '\n'.join(b)
    return new


# lines left as written: the one-key atom and bond keys stay "Hotkeys" (Nate, row 66)
KEEP_LINES = ("['Hotkeys', 'Change the atom or bond pointed at']",)


def fix_html(src: str) -> str:
    def attr(m):
        return m.group(1) + fix(m.group(2)) + m.group(3)
    src = re.sub(r'(\b(?:title|aria-label|placeholder|data-tip)=")([^"]*)(")', attr, src)
    # text between tags (skip <script> and <style> bodies)
    # (any case, and end tags such as </script > with space before the >)
    parts = re.split(r'(<script\b.*?</script\b[^>]*>|<style\b.*?</style\b[^>]*>|<!--.*?--!?>)', src, flags=re.S | re.I)
    for k in range(0, len(parts), 2):
        parts[k] = re.sub(r'(>)([^<>]+)(<)', lambda m: m.group(1) + fix_text_node(m.group(2)) + m.group(3), parts[k])
    return ''.join(parts)


def fix_text_node(t: str) -> str:
    lead = t[:len(t) - len(t.lstrip())]
    trail = t[len(t.rstrip()):]
    core = t.strip()
    # "Box" on its own in the page is the box-and-whisker chart button, not a shape
    return lead + (core if core == 'Box' else fix(core)) + trail if core else t


def fix_md(src: str) -> str:
    return fix(src)


def main() -> None:
    dry = '--dry' in sys.argv
    files = [('index.html', fix_html)]
    for d, fn in (('src', fix_ts), ('docs/guide', fix_md)):
        for dp, _, names in os.walk(os.path.join(ROOT, d)):
            for n in names:
                if (fn is fix_ts and n.endswith('.ts') and n != 'command-search.ts' and '/vendor' not in dp and not dp.endswith(os.sep + 'io')) or (fn is fix_md and n.endswith('.md')):
                    files.append((os.path.relpath(os.path.join(dp, n), ROOT), fn))
    changed = 0
    for rel, fn in files:
        p = os.path.join(ROOT, rel)
        old = open(p, encoding='utf8').read()
        new = fn(old)
        if new != old:
            changed += 1
            print(rel)
            if not dry:
                open(p, 'w', encoding='utf8').write(new)
    print(f'{changed} files {"would change" if dry else "changed"}')


if __name__ == '__main__':
    main()
