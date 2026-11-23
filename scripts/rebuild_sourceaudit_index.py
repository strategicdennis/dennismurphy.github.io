"""Refresh the dashboard's inline index from the per-batch data files."""
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


def read_inline(html, script_id):
    pattern = rf'(<script id="{script_id}" type="application/json">)(.*?)(</script>)'
    return json.loads(re.search(pattern, html, re.DOTALL)[2])


def write_inline(html, script_id, value):
    pattern = rf'(<script id="{script_id}" type="application/json">).*?(</script>)'
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    updated, count = re.subn(pattern, lambda m: m[1] + encoded + m[2], html, count=1, flags=re.DOTALL)
    if count != 1:
        raise ValueError(f"Missing inline payload {script_id}")
    return updated


def summarize_paper(claims, footnotes, followup_ids, highlight_ids):
    counts = Counter(row["status"] for row in claims)
    previews, highlights = [], []
    for row in claims:
        status = row["status"]
        if status == "unk" and (row["id"] in followup_ids or row.get("flag")):
            counts["unk"] -= 1
            counts["further_investigation"] += 1
            status = "further_investigation"
        if status in {"unk", "further_investigation"} and len(previews) < 3:
            previews.append({key: row[key] for key in ("id", "source", "finding")})
        if row["id"] in highlight_ids:
            highlights.append({"id": row["id"], "source": row["source"], "status": status})
    linked = {note for row in claims for note in row.get("footnote_ids", [])}
    placement, gaps, checks = Counter(), Counter(), Counter()
    numbered = set()
    for row in footnotes:
        numbered.update(row[9] if len(row) > 9 and row[9] else [row[6]] if row[6] else [])
        review = row[12] if len(row) > 12 and row[12] else {}
        check = row[14] if len(row) > 14 else None
        if check is None:
            check = review.get("underlying_source_check")
        if check is not None:
            checks["all"] += 1
            checks["unresolved"] += check.get("outcome") not in {"passage", "explanatory"}
        if review.get("disposition"):
            placement[review["disposition"]] += 1
            if review["disposition"] == "ambiguous" and review.get("follow_up_basis"):
                gaps[review["follow_up_basis"]] += 1
    return {
        "claims": {
            "all": len(claims),
            **{status: counts[status] for status in ("ok", "fix", "further_investigation", "unk")},
            "open": counts["further_investigation"] + counts["unk"],
        },
        "sources": len(footnotes),
        "linked": sum(row[0] in linked for row in footnotes),
        "numbered": len(numbered),
        "previews": previews,
        "highlights": highlights,
        "placement": placement,
        "gaps": gaps,
        "checks": checks,
    }


def rebuild(dashboard):
    html = dashboard.read_text(encoding="utf-8")
    data = read_inline(html, "auditDatasetJson")
    scripts = dashboard.with_name("sourceaudit-data")
    files, contents = {}, {}
    for path in sorted(scripts.glob("*.json")):
        raw = path.read_bytes()
        contents[path.stem] = json.loads(raw)
        files[path.stem] = hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()

    batch_files = [name for name in contents if re.fullmatch(r"batch-\d+", name)]
    batches = {}
    coverage = {}
    row_locations = {}
    shared_files = defaultdict(set)
    paper_batches = {}
    all_shared = {}
    footnote_file_by_paper = {}
    followup_ids = set(re.findall(r"'([\w-]+)'", html.split("const followUpClaimIds = new Set([", 1)[1].split("]);", 1)[0]))
    highlights = set(re.findall(r"\['([\w-]+)',", html.split("const reviewHighlights = [", 1)[1].split("];", 1)[0]))
    for name in batch_files:
        batch = str(int(name.split("-")[1]))
        analysis = contents[name]
        footnote_files = [key for key in contents if re.fullmatch(name + r"-footnotes(?:-\d+)?", key)]
        if not footnote_files:
            raise ValueError(f"{name} is missing its footnote data")
        footnotes = {}
        for key in footnote_files:
            for code, rows in contents[key]["rows"].items():
                if code in footnotes:
                    raise ValueError(f"Footnotes for {code} appear in multiple files")
                footnotes[code] = rows
                footnote_file_by_paper[code] = key
        codes = list(analysis["papers"])
        batches[batch] = {"analysis": name, "footnotes": footnote_files}
        if set(footnotes) - set(codes):
            raise ValueError(f"{name} contains orphan footnote papers")
        for code in codes:
            if code in paper_batches:
                raise ValueError(f"Duplicate paper {code}")
            paper_batches[code] = batch
            claims = analysis["papers"][code]["rows"]
            notes = footnotes.get(code, [])
            for kind, ids in (("claim", (row["id"] for row in claims)), ("footnote", (row[0] for row in notes))):
                for row_id in ids:
                    if row_id in row_locations:
                        raise ValueError(f"Duplicate audit ID {row_id}")
                    row_locations[row_id] = [code, kind]
            coverage[code] = summarize_paper(claims, notes, followup_ids, highlights)
            coverage[code]["hasMemo"] = bool(analysis["papers"][code].get("paper_memo"))
    if set(paper_batches) != {paper["code"] for paper in data["papers"]}:
        raise ValueError("Paper catalog and batch data differ")

    for name, content in contents.items():
        if not name.startswith("shared-"):
            continue
        for position, record in content["records"]:
            if position in all_shared:
                raise ValueError(f"Duplicate shared source position {position}")
            all_shared[position] = record
            for code in record.get("cited_by") or []:
                if code not in paper_batches:
                    raise ValueError(f"Unknown citing paper {code}")
                shared_files[paper_batches[code]].add(name)
    if sorted(all_shared) != list(range(len(all_shared))):
        raise ValueError("Shared source record positions must be contiguous")
    claim_links = defaultdict(list)
    followup_links = defaultdict(list)
    for paper in data["papers"]:
        code = paper["code"]
        batch = paper_batches[code]
        for row in contents[batches[batch]["analysis"]]["papers"][code]["rows"]:
            for note in dict.fromkeys(row.get("footnote_ids", [])):
                claim_links[note].append(row["id"])
            if row.get("related_claim_id"):
                followup_links[row["related_claim_id"]].append(row["id"])

    shared_keys = {record["key"] for record in all_shared.values()}
    family_keys = {record["key"] for record in all_shared.values() if record["type"].startswith("Footnote source family")}
    if len(shared_keys) != len(all_shared):
        raise ValueError("Duplicate shared source keys")

    data["meta"].update(
        paper_count=len(data["papers"]),
        curated_row_count=sum(item["claims"]["all"] for item in coverage.values()),
        footnote_row_count=sum(item["sources"] for item in coverage.values()),
    )
    data["meta"]["row_count"] = data["meta"]["curated_row_count"] + data["meta"]["footnote_row_count"]
    index = {
        "batches": batches,
        "paperBatches": paper_batches,
        "coverage": coverage,
        "paperFootnoteFiles": footnote_file_by_paper,
        "rowLocations": row_locations,
        "claimLinks": claim_links,
        "followupLinks": followup_links,
        "files": files,
        "sharedFiles": sorted(name for name in files if name.startswith("shared-")),
        "sharedByBatch": {batch: sorted(shared_files[batch] | {"shared-common"}) for batch in batches},
        "sharedCount": len(all_shared),
        "individualSharedCount": sum(
            record.get("family") not in family_keys and record["key"] not in family_keys
            for record in all_shared.values()
        ),
    }
    html = write_inline(html, "auditDatasetJson", data)
    html = write_inline(html, "auditDataIndex", index)
    with dashboard.open("w", encoding="utf-8", newline="\n") as output:
        output.write(html)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dashboard", type=Path, help="Path to sourceaudit.html")
    rebuild(parser.parse_args().dashboard)
