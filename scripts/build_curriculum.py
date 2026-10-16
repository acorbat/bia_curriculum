#!/usr/bin/env python3
"""Validate curriculum YAML and generate the static site's JSON and graph export."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
CURRICULUM = ROOT / "curriculum"
WEB = ROOT / "web"
WEB_DATA = WEB / "data"
GRAPH_FILE = CURRICULUM / "graphs" / "topic-dependencies.yml"


def load_collection(folder: Path, entity: str, errors: list[str]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for path in sorted(folder.glob("*.yml")):
        try:
            value = yaml.safe_load(path.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError) as exc:
            errors.append(f"{path.relative_to(ROOT)}: cannot parse YAML: {exc}")
            continue
        if not isinstance(value, dict):
            errors.append(f"{path.relative_to(ROOT)}: expected a YAML mapping")
            continue
        identifier = value.get("id")
        if not isinstance(identifier, str) or not identifier.strip():
            errors.append(f"{path.relative_to(ROOT)}: missing non-empty 'id'")
            continue
        if identifier in result:
            errors.append(f"Duplicate {entity} ID: {identifier}")
            continue
        result[identifier] = value
    return result


def ids_in(values: Any) -> list[str]:
    if values is None:
        return []
    if not isinstance(values, list):
        return []
    return [item for item in values if isinstance(item, str) and item.lower() != "none"]


def minutes(topic: dict[str, Any]) -> int:
    estimate = topic.get("estimated_time") or {}
    return sum(int(estimate.get(key, 0) or 0) for key in ("lecture_minutes", "practical_minutes", "self_study_minutes"))


def validate(topics: dict[str, dict[str, Any]], subjects: dict[str, dict[str, Any]], paths: dict[str, dict[str, Any]]) -> tuple[list[str], list[dict[str, str]]]:
    errors: list[str] = []
    edges: list[dict[str, str]] = []

    for topic_id, topic in topics.items():
        subject_id = topic.get("subject_id")
        if subject_id not in subjects:
            errors.append(f"{topic_id}: unknown subject_id {subject_id!r}")
        prereqs = topic.get("prerequisites") or {}
        if not isinstance(prereqs, dict):
            errors.append(f"{topic_id}: prerequisites must be a mapping")
            continue
        estimate = topic.get("estimated_time") or {}
        if estimate and "total_minutes" in estimate and int(estimate.get("total_minutes") or 0) != minutes(topic):
            errors.append(f"{topic_id}: estimated_time.total_minutes must equal lecture + practical + self-study minutes")
        for kind in ("required", "recommended"):
            refs = prereqs.get(kind, []) or []
            if not isinstance(refs, list):
                errors.append(f"{topic_id}: prerequisites.{kind} must be a list")
                continue
            if len(refs) != len(set(refs)):
                errors.append(f"{topic_id}: duplicate entries in prerequisites.{kind}")
            for prerequisite in refs:
                if prerequisite == "none":
                    continue
                if prerequisite not in topics:
                    errors.append(f"{topic_id}: unknown {kind} prerequisite {prerequisite!r}")
                else:
                    edges.append({"from": prerequisite, "to": topic_id, "type": kind})

    # A topic belongs to exactly one subject; subject topic lists must agree with topic.subject_id.
    for subject_id, subject in subjects.items():
        listed = subject.get("topics", []) or []
        if not isinstance(listed, list):
            errors.append(f"{subject_id}: topics must be a list")
            continue
        if len(listed) != len(set(listed)):
            errors.append(f"{subject_id}: duplicate topic IDs in topics")
        for topic_id in listed:
            if topic_id not in topics:
                errors.append(f"{subject_id}: unknown topic {topic_id!r}")
            elif topics[topic_id].get("subject_id") != subject_id:
                errors.append(f"{subject_id}: {topic_id} is listed here but has subject_id {topics[topic_id].get('subject_id')!r}")
        for topic_id in ids_in(subject.get("recommended_order", [])):
            if topic_id not in listed:
                errors.append(f"{subject_id}: recommended_order topic {topic_id} is not in topics")

    for topic_id, topic in topics.items():
        subject_id = topic.get("subject_id")
        if subject_id in subjects and topic_id not in (subjects[subject_id].get("topics") or []):
            errors.append(f"{topic_id}: missing from its subject {subject_id}.topics")

    for path_id, path in paths.items():
        ordered = path.get("topics_ordered", []) or []
        if not isinstance(ordered, list):
            errors.append(f"{path_id}: topics_ordered must be a list")
            continue
        if len(ordered) != len(set(ordered)):
            errors.append(f"{path_id}: duplicate topic IDs in topics_ordered")
        unknown = [topic_id for topic_id in ordered if topic_id not in topics]
        for topic_id in unknown:
            errors.append(f"{path_id}: unknown topic {topic_id!r}")
        position = {topic_id: index for index, topic_id in enumerate(ordered)}
        for topic_id in ordered:
            if topic_id not in topics:
                continue
            for prerequisite in ids_in((topics[topic_id].get("prerequisites") or {}).get("required", [])):
                if prerequisite not in position:
                    errors.append(f"{path_id}: {topic_id} requires {prerequisite}, which is neither in the path nor declared as prior knowledge")
                elif position[prerequisite] >= position[topic_id]:
                    errors.append(f"{path_id}: required prerequisite {prerequisite} must come before {topic_id}")
        bridges = path.get("optional_bridge_topics", []) or []
        if not isinstance(bridges, list):
            errors.append(f"{path_id}: optional_bridge_topics must be a list")
        else:
            for bridge in bridges:
                if bridge not in topics:
                    errors.append(f"{path_id}: unknown bridge topic {bridge!r}")
                elif bridge not in ordered:
                    errors.append(f"{path_id}: bridge topic {bridge} must appear in topics_ordered")
        constraints = path.get("constraints") or {}
        declared_time = constraints.get("total_minutes")
        if declared_time is not None:
            calculated_time = sum(minutes(topics[topic_id]) for topic_id in ordered if topic_id in topics)
            if int(declared_time) != calculated_time:
                errors.append(f"{path_id}: constraints.total_minutes is {declared_time}, expected {calculated_time} from topics_ordered")

    # Required prerequisite graph must be acyclic.
    adjacency: dict[str, list[str]] = defaultdict(list)
    indegree = {topic_id: 0 for topic_id in topics}
    for edge in edges:
        if edge["type"] != "required":
            continue
        adjacency[edge["from"]].append(edge["to"])
        indegree[edge["to"]] += 1
    queue = deque(topic_id for topic_id, degree in indegree.items() if degree == 0)
    visited = 0
    while queue:
        topic_id = queue.popleft()
        visited += 1
        for dependent in adjacency[topic_id]:
            indegree[dependent] -= 1
            if indegree[dependent] == 0:
                queue.append(dependent)
    if visited != len(topics):
        errors.append("Required prerequisite graph contains a cycle")

    return errors, edges


def build_payload(topics: dict[str, dict[str, Any]], subjects: dict[str, dict[str, Any]], paths: dict[str, dict[str, Any]], edges: list[dict[str, str]]) -> dict[str, Any]:
    subject_topic_times: dict[str, dict[str, int]] = {}
    for subject_id, subject in subjects.items():
        members = [topics[topic_id] for topic_id in (subject.get("topics") or []) if topic_id in topics]
        subject_topic_times[subject_id] = {
            "total_lecture_minutes": sum(int((t.get("estimated_time") or {}).get("lecture_minutes", 0) or 0) for t in members),
            "total_practical_minutes": sum(int((t.get("estimated_time") or {}).get("practical_minutes", 0) or 0) for t in members),
            "total_self_study_minutes": sum(int((t.get("estimated_time") or {}).get("self_study_minutes", 0) or 0) for t in members),
            "total_minutes": sum(minutes(t) for t in members),
        }

    subjects_for_web = {}
    for subject_id, subject in subjects.items():
        subjects_for_web[subject_id] = dict(subject)
        subjects_for_web[subject_id]["estimated_time"] = subject_topic_times[subject_id]

    topics_for_web = {}
    for topic_id, topic in topics.items():
        topics_for_web[topic_id] = dict(topic)
        topics_for_web[topic_id]["dependencies"] = {
            "enables": [edge["to"] for edge in edges if edge["from"] == topic_id]
        }

    return {
        "schema_version": 1,
        "subjects": subjects_for_web,
        "topics": topics_for_web,
        "paths": paths,
        "edges": edges,
        "derived": {
            "subject_time_estimates": subject_topic_times,
            "topic_time_estimates": {topic_id: minutes(topic) for topic_id, topic in topics.items()},
            "path_time_estimates": {
                path_id: sum(minutes(topics[topic_id]) for topic_id in (path.get("topics_ordered") or []) if topic_id in topics)
                for path_id, path in paths.items()
            },
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate data and ensure generated files are current without writing")
    args = parser.parse_args()

    errors: list[str] = []
    topics = load_collection(CURRICULUM / "topics", "topic", errors)
    subjects = load_collection(CURRICULUM / "subjects", "subject", errors)
    paths = load_collection(CURRICULUM / "paths", "path", errors)
    validation_errors, edges = validate(topics, subjects, paths)
    errors.extend(validation_errors)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"Validation failed with {len(errors)} error(s).", file=sys.stderr)
        return 1

    print(f"Validated {len(subjects)} subjects, {len(topics)} topics, {len(paths)} paths, and {len(edges)} dependency edges.")
    payload = build_payload(topics, subjects, paths, edges)
    generated = {
        WEB_DATA / "curriculum.json": json.dumps(payload, indent=2, ensure_ascii=False, default=lambda value: value.isoformat() if isinstance(value, (date, datetime)) else str(value)) + "\n",
        GRAPH_FILE: yaml.safe_dump({"edges": edges}, sort_keys=False, allow_unicode=True),
        WEB / "LICENSE": (ROOT / "LICENSE").read_text(encoding="utf-8"),
    }
    if args.check:
        stale = [path.relative_to(ROOT) for path, content in generated.items() if not path.exists() or path.read_text(encoding="utf-8") != content]
        if stale:
            for path in stale:
                print(f"ERROR: generated file is stale: {path}; run python scripts/build_curriculum.py", file=sys.stderr)
            return 1
        print("Generated files are up to date; no files were written.")
        return 0

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    for path, content in generated.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    print(f"Wrote {WEB_DATA.relative_to(ROOT)}/curriculum.json and {GRAPH_FILE.relative_to(ROOT)} (dependency graph derived from topic prerequisites).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
