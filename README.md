# Bioimage Analysis Curriculum

This repository contains structured curriculum metadata and an interactive explorer for a modular, dependency-aware bioimage analysis (BIA) curriculum.

## Explore the curriculum

The explorer in [`web/`](web/) shows topic dependencies, topic details, subject filters, learner-background filters, and curated learning paths. Selecting a path or topic updates the URL, so you can share a preselected route. Its data is generated from the YAML curriculum files.

### Run locally

Requires Python 3 and PyYAML:

```bash
python -m pip install -r scripts/requirements.txt
python scripts/build_curriculum.py
python -m http.server 8000 --directory web
```

Open <http://localhost:8000>. Serve the files over HTTP rather than opening `web/index.html` directly, because browsers restrict `fetch()` from `file://` URLs.

### Publish with GitHub Pages

The workflow at `.github/workflows/pages.yml` validates the curriculum and deploys the `web/` directory on pushes to `main`. GitHub Pages is configured to use **GitHub Actions** for this repository. Pull requests run validation/build but do not deploy. After the workflow is pushed and succeeds, the explorer will be available at <https://acorbat.github.io/bia_curriculum/>.

## Authoring and data flow

- `curriculum/topics/*.yml` — topic metadata; each topic's `prerequisites` is the canonical source for dependency edges.
- `curriculum/subjects/*.yml` — subject groupings and learning goals. Each topic belongs to one subject via `subject_id`.
- `curriculum/paths/*.yml` — curated, ordered audience-specific learning paths.
- `curriculum/graphs/topic-dependencies.yml` — generated graph export; do not edit by hand.
- `web/data/curriculum.json` — generated data consumed by the explorer; do not edit by hand.
- `scripts/build_curriculum.py` — validates IDs/references, required prerequisite cycles and path prerequisite order, then generates the graph export and explorer data.

After editing curriculum YAML, run:

```bash
python scripts/build_curriculum.py
```

Validate curriculum and confirm the generated graph/JSON are current without writing files:

```bash
python scripts/build_curriculum.py --check
```

For a path, include all required prerequisites in `topics_ordered` and put them before dependent topics. `optional_bridge_topics` must also be present in the ordered sequence; the explorer marks those topics as bridges. `constraints.total_minutes` is intended to reflect the summed teaching, practice, and self-study estimates for path topics.

## Repository layout

- `curriculum/subjects/` — subject definitions
- `curriculum/topics/` — topic definitions
- `curriculum/paths/` — audience-specific learning paths
- `curriculum/graphs/` — generated dependency graph export
- `references/` — bibliography and source mappings
- `templates/` — templates for new entries
- `scripts/` — validation and data generation
- `web/` — static interactive curriculum explorer

See [`AGENTS.md`](AGENTS.md) for project conventions and the curriculum annotation schema.
