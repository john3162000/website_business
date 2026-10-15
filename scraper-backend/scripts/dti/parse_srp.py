"""Parse a DTI SRP bulletin (Basic Necessities and Prime Commodities) into a TSV.

Refresh when DTI posts a new bulletin
(dti.gov.ph → Consumer → Latest SRPs of Basic Necessities and Prime Commodities):

    pdftotext -table <bulletin>.pdf bulletin.txt
    python scripts/dti/parse_srp.py bulletin.txt data/source/dti-srp-<YYYY-MM-DD>.tsv

then update the "DTI SRP …" rows in data/catalog/manual-prices.tsv from it and
run `node scripts/build-catalog.mjs`.

The bulletin is one A3 page with three columns. Tokens are runs separated by
2+ spaces; a price token ends an item, the token before it is the size, the
ones before that the name. Columns are told apart by where tokens start,
anchored on the three SRP header positions.
"""
import re
import sys

src, out = sys.argv[1], sys.argv[2]
text = open(src, encoding="latin-1").read().replace("\x0c", "").replace("\x96", "-").replace("\x92", "'").replace("\xad", "-")
lines = text.split("\n")
hi = next(i for i, l in enumerate(lines) if l.count("UNIT") == 3)
srp_x = [m.start() for m in re.finditer(r"\bSRP\b", lines[hi])]
# A column ends just after its SRP header.
ends = [x + 8 for x in srp_x[:-1]] + [10_000]


def col_of(pos):
    return next(i for i, e in enumerate(ends) if pos < e)


PRICE = re.compile(r"^\d{1,4}\.\d{2}$")
SIZE = re.compile(r"^(\d+(\.\d+)?\s?(g|kg|ml|mL|L|l)|#\w+|AA|D|C)$")
UPPER = re.compile(r"^[A-Z0-9 &/\-().,']+$")

section = [None, None, None]
pending = [[], [], []]  # name fragments waiting for their size and price
rows = []
for l in lines[hi + 1:]:
    for m in re.finditer(r"\S+(?: \S+)*", l):
        pos, t = m.start(), m.group(0).strip()
        c = col_of(pos)
        if PRICE.match(t):
            frags = pending[c]
            size = frags.pop() if frags and SIZE.match(frags[-1]) else ""
            name = " ".join(frags).strip()
            if not name and rows and rows[-1]["col"] == c:
                name = rows[-1]["product"]  # another size of the product above
            rows.append({"col": c, "section": section[c], "product": re.sub(r"\s+", " ", name), "size": size, "srp": float(t)})
            pending[c] = []
        elif UPPER.match(t) and len(t) > 3 and not re.search(r"\d", t) and not SIZE.match(t):
            section[c] = t
            pending[c] = []
        else:
            # "Sardines 155g" can arrive as one token: split a trailing size off.
            s = re.match(r"^(.*\S)\s+(\d+(\.\d+)?\s?(g|kg|ml|mL|L))$", t)
            pending[c] += [s.group(1), s.group(2)] if s else [t]

with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write("section\tproduct\tsize\tsrp\n")
    for r in rows:
        f.write(f"{r['section'] or ''}\t{r['product']}\t{r['size']}\t{r['srp']:.2f}\n")
print(len(rows), "priced rows written to", out)
