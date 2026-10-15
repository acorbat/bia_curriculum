# AGENTS.md — Bioimage Analysis Curriculum Project

## Project context
This repository is dedicated to designing and maintaining a **Bioimage Analysis (BIA) curriculum**.

Primary goals:
- Define a structured set of topics and learning outcomes for BIA training.
- Organize topics into coherent subjects/modules.
- Capture prerequisite dependencies between topics.
- Track estimated teaching time and expected learner background.
- Support different audiences (e.g., biology, physics, computer science).
- Build a curriculum that can be delivered as full courses, workshops, and modular short trainings.

This work can be aligned with:
- The framework and competency-oriented thinking from the Journal of Microscopy publication shared by the project owner.
- Existing community modules/resources, including NEUBIAS training resources.

---

## Repository conventions

### 1) Git workflow
- Default branch: `main`.
- Use feature branches for substantial additions:
  - `feat/<short-description>`
  - `docs/<short-description>`
  - `data/<short-description>`
- Commit style (recommended):
  - `feat: add core microscopy foundations topic set`
  - `docs: define topic annotation schema`
  - `data: add initial dependency graph for segmentation track`

### 2) Directory structure (recommended initial layout)
- `README.md` — high-level project overview and usage.
- `curriculum/subjects/` — subject-level definitions (e.g., microscopy, segmentation, statistics).
- `curriculum/topics/` — individual topic files.
- `curriculum/paths/` — audience-specific pathways (e.g., biologists, physicists, computer scientists).
- `curriculum/graphs/` — machine-readable dependency graph exports.
- `references/` — bibliography and source mappings to external resources.
- `templates/` — templates for new subject/topic files.
- `scripts/` — curriculum validation and YAML-to-JSON generation.
- `web/` — static interactive explorer deployed through GitHub Pages.

### 3) Data format conventions
- Prefer **YAML** for human-editable curriculum metadata.
- Prefer **CSV/TSV** only for simple tabular exports.
- `curriculum/topics/*.yml` is canonical for topic data and prerequisite relationships.
- Outgoing dependency links are derived from prerequisite lists; do not duplicate them on topics.
- Subject membership is canonical on each topic's `subject_id`; subject topic lists must match it.
- `curriculum/graphs/topic-dependencies.yml` and `web/data/curriculum.json` are generated outputs; do not hand-edit them.
- Run `python scripts/build_curriculum.py` after editing curriculum YAML. Use `--check` for validation without generating files.
- Use stable IDs for all entities:
  - Subject ID: `SUBJ-<slug>`
  - Topic ID: `TOP-<slug>`

Example slugs:
- `SUBJ-image-formation`
- `TOP-psf-and-resolution`

### 4) Naming conventions
- File names in `kebab-case`.
- One topic per file: `curriculum/topics/top-psf-and-resolution.yml`.
- One subject per file: `curriculum/subjects/subj-image-formation.yml`.

### 5) Source traceability
For every topic, keep references to:
- Canonical external resources.
- Original inspiration module(s).
- Notes on adaptation for this curriculum.

### 6) Learning path integrity
- Include all required prerequisites in `topics_ordered` and place them before dependent topics.
- `optional_bridge_topics` must be part of the path sequence and are highlighted in the explorer.
- Keep `constraints.total_minutes` synchronized with the sum of selected topic time estimates.
- Validate path IDs, topic IDs, prerequisite order, and cycles with `python scripts/build_curriculum.py`.

### 7) Interactive explorer
- The browser app is a static site in `web/`; it uses the generated `web/data/curriculum.json`.
- Preview locally with `python -m http.server 8000 --directory web` after generating the data.
- GitHub Actions validates and deploys the site to GitHub Pages. Configure repository Pages source as **GitHub Actions**.

---

## Topic annotation proposal

Use a structured schema to support planning, sequencing, and audience adaptation.

### A. Core entities
1. **Subject**: thematic group of related topics.
2. **Topic**: smallest teachable unit with explicit learning outcomes.
3. **Learning Path**: ordered selection of topics for a target audience and duration.

### B. Topic schema (recommended fields)
```yaml
id: TOP-psf-and-resolution
title: Point Spread Function (PSF) and Resolution
subject_id: SUBJ-image-formation
summary: Fundamental concepts of optical resolution and PSF in microscopy.

learning_outcomes:
  - Explain PSF and diffraction-limited resolution.
  - Relate sampling and resolution to downstream analysis quality.

prerequisites:
  required:
    - TOP-basic-wave-optics
    - TOP-pixel-size-and-sampling
  recommended:
    - TOP-noise-models

estimated_time:
  lecture_minutes: 45
  practical_minutes: 30
  self_study_minutes: 60
  total_minutes: 135

level:
  bloom_min: understand
  bloom_target: apply
  difficulty: foundational   # foundational | intermediate | advanced

audience_prior_knowledge:
  biology: low               # low | medium | high
  physics: medium
  computer_science: low

skill_overlap:
  likely_known_by:
    - physics
  likely_new_for:
    - biology
    - computer_science

delivery:
  format_options:
    - lecture
    - guided-exercise
  assessment:
    - quiz
    - concept-check

# Outgoing dependency links are derived from other topics' prerequisites.

tags:
  - microscopy
  - image-formation
  - resolution
  - foundations

references:
  - type: publication
    citation: "..."
    url: "..."
  - type: training-module
    citation: "NEUBIAS module ..."
    url: "..."

status:
  maturity: draft            # draft | reviewed | approved
  owner: curriculum-team
  last_updated: 2026-08-31
```

### C. Dependency modeling options

#### Option 1 — Simple prerequisite lists (quick start)
- Store `prerequisites.required` and `prerequisites.recommended` in each topic.
- Easy for humans, enough for manual planning.

#### Option 2 — Explicit graph export (used by this project)
- Generate `curriculum/graphs/topic-dependencies.yml` from each topic's `prerequisites` fields.
- Edges contain `from`, `to`, and `type: required | recommended`.
- Do not edit the graph export manually; run `python scripts/build_curriculum.py` to regenerate it and the web data.
- The generated graph supports visualization and automated schedule checks.

#### Option 3 — Weighted dependency graph (advanced)
- Add edge weights (`strength: 1..5`) and competency dimensions.
- Useful for adaptive learning paths by audience background.

---

## Subject grouping proposal

A practical hierarchy:
1. **Imaging Foundations**
   - optics, sampling, noise, artifacts
2. **Image Data & Formats**
   - metadata, OME, reproducibility basics
3. **Preprocessing**
   - denoising, background correction, registration, deconvolution basics
4. **Segmentation & Object Detection**
   - thresholding, classical methods, DL-based methods overview
5. **Feature Extraction & Quantification**
   - morphology, intensity, texture, colocalization
6. **Statistics & Experimental Design**
   - controls, power, uncertainty, interpretation
7. **Automation, Scripting, and Reproducibility**
   - workflows, notebooks, pipelines, versioning
8. **Machine Learning in BIA**
   - data labeling, validation, bias, model selection
9. **Domain Applications**
   - cell biology, tissue analysis, high-content screening

---

## Background-aware adaptation strategy

For each topic, track expected prior knowledge by background (`biology`, `physics`, `computer_science`) and define bridging micro-topics.

Examples:
- Biology learners may need bridging in linear algebra, signal processing, and coding.
- Physics learners may need bridging in biological context and experimental variability.
- Computer science learners may need bridging in microscopy physics and assay constraints.

Implement via:
- `bridge_for: [biology|physics|computer_science]` tags on selected topics.
- Optional short "bridge modules" (15–45 min each) inserted into audience-specific paths.

---

## Minimum quality checklist for new topics
Before marking a topic as `reviewed`, ensure:
- Clear learning outcomes.
- At least one required or contextual prerequisite (or explicit `none`).
- Time estimate (lecture/practical/self-study).
- Audience prior-knowledge profile.
- At least one assessment idea.
- At least one reference source.

---

## Suggested next steps
1. Create base folder structure under `curriculum/`, `references/`, and `templates/`.
2. Draft initial subject list and IDs.
3. Add 20–30 core foundational topics with metadata.
4. Build a first dependency graph and validate it for cycles.
5. Define 3 starter learning paths:
   - BIA for biologists
   - BIA for physicists
   - BIA for computer scientists
