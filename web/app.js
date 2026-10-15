(() => {
  'use strict';

  const palette = ['#64a89d', '#d28a61', '#7d92c2', '#b18bb7', '#c5a34e', '#5d9ab1', '#d07b84', '#789d69', '#9183be', '#c782a9'];
  const labels = { biology: 'Biology', physics: 'Physics', computer_science: 'Computer science', mixed: 'Mixed' };
  const byId = (id) => document.getElementById(id);
  const state = { data: null, cy: null, subjectColors: {}, selectedTopic: null, activePath: 'all', visibleTopicIds: new Set() };

  const esc = (value) => String(value ?? '');
  const formatTime = (minutes) => {
    const value = Number(minutes) || 0;
    if (value < 60) return `${value} min`;
    const hours = Math.floor(value / 60);
    const remainder = value % 60;
    return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
  };
  const titleCase = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  function syncUrl() {
    const url = new URL(window.location.href);
    if (state.activePath && state.activePath !== 'all') url.searchParams.set('path', state.activePath);
    else url.searchParams.delete('path');
    if (state.selectedTopic) url.searchParams.set('topic', state.selectedTopic);
    else url.searchParams.delete('topic');
    window.history.replaceState(null, '', url);
  }

  function safeExternalLink(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch (_) { return null; }
  }

  function appendText(parent, tag, text, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = esc(text);
    parent.appendChild(element);
    return element;
  }

  function addOptions() {
    const subjectSelect = byId('subject-filter');
    const subjects = Object.values(state.data.subjects).sort((a, b) => a.name.localeCompare(b.name));
    subjects.forEach((subject, index) => {
      state.subjectColors[subject.id] = palette[index % palette.length];
      const option = document.createElement('option');
      option.value = subject.id;
      option.textContent = subject.name;
      subjectSelect.appendChild(option);
    });
    subjects.forEach((subject) => {
      const row = document.createElement('div');
      row.className = 'legend-item';
      const dot = document.createElement('i');
      dot.className = 'legend-dot';
      dot.style.backgroundColor = state.subjectColors[subject.id];
      row.append(dot, document.createTextNode(subject.name));
      byId('subject-legend').appendChild(row);
    });
    Object.values(state.data.paths).sort((a, b) => a.name.localeCompare(b.name)).forEach((path) => {
      const option = document.createElement('option');
      option.value = path.id;
      option.textContent = path.name;
      byId('path-select').appendChild(option);
    });
  }

  function initializeGraph() {
    if (!window.cytoscape) throw new Error('Could not load Cytoscape.js. Check your internet connection and reload.');
    const nodes = Object.entries(state.data.topics).map(([id, topic]) => ({
      data: {
        id,
        label: topic.title,
        title: topic.title,
        subjectId: topic.subject_id,
        subject: state.data.subjects[topic.subject_id]?.name || topic.subject_id,
        color: state.subjectColors[topic.subject_id] || '#83928f',
      },
    }));
    const edges = state.data.edges.map((edge, index) => ({
      data: { id: `edge-${index}`, source: edge.from, target: edge.to, type: edge.type },
    }));

    state.cy = window.cytoscape({
      container: byId('graph'),
      elements: [...nodes, ...edges],
      minZoom: 0.2,
      maxZoom: 2.4,
      wheelSensitivity: 0.22,
      boxSelectionEnabled: true,
      style: [
        { selector: 'node', style: {
          'background-color': 'data(color)', 'label': 'data(label)', 'color': '#183139',
          'font-family': 'DM Sans, sans-serif', 'font-size': 9, 'font-weight': 600,
          'text-wrap': 'wrap', 'text-max-width': 105, 'text-valign': 'center', 'text-halign': 'center',
          'width': 'label', 'height': 'label', 'padding': '12px', 'shape': 'round-rectangle',
          'border-width': 1, 'border-color': '#ffffff', 'text-outline-width': 0,
          'overlay-opacity': 0,
        } },
        { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#173e44', 'z-index': 10 } },
        { selector: 'node.path-member', style: { 'border-width': 2, 'border-color': '#fff', 'shadow-blur': 13, 'shadow-color': '#087e78', 'shadow-opacity': 0.32, 'shadow-offset-x': 0, 'shadow-offset-y': 0 } },
        { selector: 'node.path-bridge', style: { 'border-style': 'dashed', 'border-width': 3, 'border-color': '#876b2c' } },
        { selector: 'node.search-match', style: { 'border-width': 3, 'border-color': '#263e75', 'z-index': 12 } },
        { selector: 'node.faded', style: { 'opacity': 0.16 } },
        { selector: 'edge', style: {
          'width': 1.5, 'line-color': '#8e9d9d', 'target-arrow-color': '#8e9d9d',
          'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': 0.8,
          'opacity': 0.66, 'line-style': 'solid',
        } },
        { selector: 'edge[type = "recommended"]', style: { 'line-style': 'dashed', 'opacity': 0.38, 'width': 1.2 } },
        { selector: 'edge.faded', style: { 'opacity': 0.04 } },
        { selector: 'edge.hidden-edge', style: { 'display': 'none' } },
      ],
      layout: { name: 'cose', animate: false, fit: true, padding: 34, nodeRepulsion: 7000, idealEdgeLength: 125, edgeElasticity: 80, gravity: 0.25, numIter: 800, randomize: true },
    });

    state.cy.on('tap', 'node', (event) => selectTopic(event.target.id()));
    state.cy.on('mouseover', 'node', showTooltip);
    state.cy.on('mousemove', 'node', showTooltip);
    state.cy.on('mouseout', 'node', () => { byId('graph-tooltip').hidden = true; });
    state.cy.on('tap', (event) => { if (event.target === state.cy) selectTopic(null); });
    byId('graph-loading').remove();
  }

  function showTooltip(event) {
    const node = event.target;
    const tooltip = byId('graph-tooltip');
    const rect = byId('graph').getBoundingClientRect();
    const pos = node.renderedPosition();
    tooltip.replaceChildren();
    appendText(tooltip, 'strong', node.data('title'));
    appendText(tooltip, 'span', node.data('subject'));
    tooltip.hidden = false;
    const left = Math.min(Math.max(8, pos.x + 15), rect.width - 230);
    const top = Math.min(Math.max(8, pos.y + 12), rect.height - 60);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function setActivePath(pathId) {
    state.activePath = pathId;
    syncUrl();
    byId('copy-path-link').hidden = pathId === 'all';
    state.cy.nodes().removeClass('path-member path-bridge');
    const list = byId('path-topic-list');
    list.replaceChildren();
    if (pathId === 'all') {
      byId('path-summary').textContent = 'Select a route to highlight its sequence in the map.';
      applyFilters();
      return;
    }
    const path = state.data.paths[pathId];
    if (!path) return;
    const bridgeSet = new Set(path.optional_bridge_topics || []);
    const pathTopics = path.topics_ordered || [];
    const allMinutes = state.data.derived.path_time_estimates[pathId] || 0;
    const coreMinutes = pathTopics.filter((topicId) => !bridgeSet.has(topicId)).reduce((sum, topicId) => sum + (state.data.derived.topic_time_estimates[topicId] || 0), 0);
    const bridgeNote = bridgeSet.size ? ` · ${formatTime(coreMinutes)} without ${bridgeSet.size} optional bridge${bridgeSet.size === 1 ? '' : 's'}` : '';
    byId('path-summary').textContent = `${path.summary || ''} ${pathTopics.length} topics · ${formatTime(allMinutes)} including bridges${bridgeNote}. Audience: ${labels[path.target_audience] || titleCase(path.target_audience)}.`;
    pathTopics.forEach((topicId, index) => {
      const topic = state.data.topics[topicId];
      if (!topic) return;
      const node = state.cy.getElementById(topicId);
      node.addClass('path-member');
      if (bridgeSet.has(topicId)) node.addClass('path-bridge');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'path-step';
      const number = appendText(button, 'span', String(index + 1).padStart(2, '0'), 'step-number');
      number.setAttribute('aria-hidden', 'true');
      appendText(button, 'span', topic.title);
      if (bridgeSet.has(topicId)) appendText(button, 'span', 'Bridge', 'bridge-badge');
      button.addEventListener('click', () => {
        selectTopic(topicId);
        state.cy.animate({ center: { eles: node }, zoom: Math.max(state.cy.zoom(), 0.78) }, { duration: 250 });
      });
      list.appendChild(button);
    });
    applyFilters();
  }

  function applyFilters() {
    const query = byId('search-topics').value.trim().toLocaleLowerCase();
    const subjectId = byId('subject-filter').value;
    const background = byId('background-filter').value;
    const difficulty = byId('level-filter').value;
    const showRecommended = byId('show-recommended').checked;
    const activePath = state.activePath === 'all' ? null : state.data.paths[state.activePath];
    const pathSet = activePath ? new Set(activePath.topics_ordered) : null;
    const visible = new Set();
    const searchMatches = new Set();

    Object.entries(state.data.topics).forEach(([topicId, topic]) => {
      const haystack = [topic.title, topic.summary, ...(topic.tags || []), ...(topic.learning_outcomes || [])].join(' ').toLocaleLowerCase();
      const matches = (!query || haystack.includes(query))
        && (subjectId === 'all' || topic.subject_id === subjectId)
        && (background === 'all' || (topic.skill_overlap?.likely_new_for || []).includes(background))
        && (difficulty === 'all' || topic.level?.difficulty === difficulty);
      if (matches) visible.add(topicId);
      if (query && haystack.includes(query)) searchMatches.add(topicId);
    });
    state.visibleTopicIds = visible;
    state.cy.nodes().forEach((node) => {
      const topicId = node.id();
      node.style('display', visible.has(topicId) ? 'element' : 'none');
      node.toggleClass('faded', Boolean(pathSet && !pathSet.has(topicId)));
      node.toggleClass('search-match', searchMatches.has(topicId));
    });
    state.cy.edges().forEach((edge) => {
      const show = visible.has(edge.source().id()) && visible.has(edge.target().id()) && (showRecommended || edge.data('type') !== 'recommended');
      edge.toggleClass('hidden-edge', !show);
      edge.toggleClass('faded', Boolean(pathSet && (!pathSet.has(edge.source().id()) || !pathSet.has(edge.target().id()))));
    });
    const selected = state.selectedTopic;
    if (selected && !visible.has(selected)) selectTopic(null);
    byId('topic-count').textContent = `${visible.size} / ${Object.keys(state.data.topics).length} topics`;
  }

  function addPrerequisiteList(parent, ids, kind) {
    if (!ids || !ids.length) {
      appendText(parent, 'p', 'None listed.', 'field-hint');
      return;
    }
    const list = document.createElement('ul');
    list.className = 'prereq-list';
    ids.forEach((id) => {
      const topic = state.data.topics[id];
      if (!topic) return;
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prereq-button';
      const badge = appendText(button, 'span', kind, 'prereq-kind');
      badge.setAttribute('aria-hidden', 'true');
      button.appendChild(document.createTextNode(topic.title));
      button.addEventListener('click', () => {
        selectTopic(id);
        const node = state.cy.getElementById(id);
        if (node.length && state.visibleTopicIds.has(id)) state.cy.animate({ center: { eles: node }, zoom: Math.max(state.cy.zoom(), 0.78) }, { duration: 250 });
      });
      li.appendChild(button);
      list.appendChild(li);
    });
    parent.appendChild(list);
  }

  function addDetailSection(container, heading) {
    const section = document.createElement('section');
    section.className = 'detail-section';
    appendText(section, 'h3', heading);
    container.appendChild(section);
    return section;
  }

  function selectTopic(topicId) {
    state.selectedTopic = topicId;
    syncUrl();
    state.cy.nodes().unselect();
    if (!topicId || !state.data.topics[topicId]) {
      byId('detail-panel').replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'empty-detail';
      appendText(empty, 'div', '✳', 'detail-icon');
      appendText(empty, 'p', 'Topic details', 'eyebrow');
      appendText(empty, 'h2', 'Choose a topic');
      appendText(empty, 'p', 'Select a node in the map or a topic in a learning path to see its outcomes, time estimate, prerequisites, and references.');
      byId('detail-panel').appendChild(empty);
      return;
    }
    const node = state.cy.getElementById(topicId);
    if (node.length) node.select();
    const topic = state.data.topics[topicId];
    const container = document.createElement('div');
    appendText(container, 'p', 'Topic details', 'eyebrow');
    appendText(container, 'h2', topic.title, 'detail-title');
    const subjectLine = document.createElement('div');
    subjectLine.className = 'detail-subject';
    const dot = document.createElement('i');
    dot.className = 'legend-dot';
    dot.style.backgroundColor = state.subjectColors[topic.subject_id] || '#83928f';
    subjectLine.append(dot, document.createTextNode(state.data.subjects[topic.subject_id]?.name || topic.subject_id));
    container.appendChild(subjectLine);
    appendText(container, 'p', topic.summary, 'detail-summary');

    const outcomes = addDetailSection(container, 'Learning outcomes');
    const outcomeList = document.createElement('ul');
    outcomeList.className = 'outcome-list';
    (topic.learning_outcomes || []).forEach((outcome) => appendText(outcomeList, 'li', outcome));
    outcomes.appendChild(outcomeList);

    const times = topic.estimated_time || {};
    const timeSection = addDetailSection(container, 'Estimated time');
    const grid = document.createElement('div');
    grid.className = 'time-grid';
    [['lecture_minutes', 'Lecture'], ['practical_minutes', 'Practice'], ['self_study_minutes', 'Self-study']].forEach(([field, label]) => {
      const cell = document.createElement('div');
      cell.className = 'time-cell';
      appendText(cell, 'strong', formatTime(times[field] || 0));
      appendText(cell, 'span', label);
      grid.appendChild(cell);
    });
    timeSection.appendChild(grid);
    appendText(timeSection, 'p', `Total: ${formatTime(state.data.derived.topic_time_estimates[topicId] || 0)}`, 'total-time');

    const prereq = topic.prerequisites || {};
    const requiredSection = addDetailSection(container, 'Required prerequisites');
    addPrerequisiteList(requiredSection, (prereq.required || []).filter((id) => id.toLowerCase() !== 'none'), 'Required');
    const recommendedSection = addDetailSection(container, 'Recommended prerequisites');
    addPrerequisiteList(recommendedSection, prereq.recommended || [], 'Recommended');

    const enables = topic.dependencies?.enables || [];
    const enablesSection = addDetailSection(container, 'Topics this prepares you for');
    addPrerequisiteList(enablesSection, enables, 'Next');

    const background = topic.audience_prior_knowledge || {};
    const profileSection = addDetailSection(container, 'Prior knowledge by background');
    const profile = document.createElement('div');
    profile.className = 'tag-list';
    Object.entries(labels).filter(([key]) => key !== 'mixed').forEach(([key, label]) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `${label}: ${background[key] || 'unspecified'}`;
      profile.appendChild(tag);
    });
    profileSection.appendChild(profile);
    const skill = topic.skill_overlap || {};
    const prior = (skill.likely_known_by || []).map((value) => labels[value] || titleCase(value));
    const newFor = (skill.likely_new_for || []).map((value) => labels[value] || titleCase(value));
    appendText(profileSection, 'p', `Likely familiar: ${prior.length ? prior.join(', ') : 'not specified'} · likely new: ${newFor.length ? newFor.join(', ') : 'not specified'}`, 'field-hint');

    if (topic.tags?.length) {
      const tagsSection = addDetailSection(container, 'Tags');
      const tags = document.createElement('div');
      tags.className = 'tag-list';
      topic.tags.forEach((tag) => appendText(tags, 'span', tag, 'tag'));
      tagsSection.appendChild(tags);
    }

    const references = addDetailSection(container, 'References');
    const refList = document.createElement('ul');
    refList.className = 'ref-list';
    (topic.references || []).forEach((reference) => {
      const li = document.createElement('li');
      const url = safeExternalLink(reference.url);
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = reference.citation || reference.url;
        li.appendChild(link);
      } else {
        li.textContent = reference.citation || reference.url || 'Reference';
      }
      refList.appendChild(li);
    });
    references.appendChild(refList);

    const status = topic.status || {};
    const statusBadge = appendText(container, 'span', status.maturity || 'draft', 'status-chip');
    statusBadge.title = `Updated ${status.last_updated || 'date unspecified'}`;
    const yamlPath = `https://github.com/acorbat/bia_curriculum/blob/main/curriculum/topics/${topicId.toLowerCase()}.yml`;
    const yamlLink = document.createElement('a');
    yamlLink.className = 'yaml-link';
    yamlLink.href = yamlPath;
    yamlLink.target = '_blank';
    yamlLink.rel = 'noopener noreferrer';
    yamlLink.textContent = 'View topic YAML ↗';
    container.appendChild(yamlLink);
    byId('detail-panel').replaceChildren(container);
  }

  function attachControls() {
    ['search-topics', 'subject-filter', 'background-filter', 'level-filter', 'show-recommended'].forEach((id) => {
      byId(id).addEventListener(id === 'search-topics' ? 'input' : 'change', applyFilters);
    });
    byId('path-select').addEventListener('change', (event) => setActivePath(event.target.value));
    byId('reset-filters').addEventListener('click', () => {
      byId('search-topics').value = '';
      byId('subject-filter').value = 'all';
      byId('background-filter').value = 'all';
      byId('level-filter').value = 'all';
      byId('show-recommended').checked = true;
      byId('path-select').value = 'all';
      setActivePath('all');
      selectTopic(null);
      state.cy.fit(undefined, 34);
    });
    byId('fit-map').addEventListener('click', () => state.cy.fit(undefined, 34));
    byId('copy-path-link').addEventListener('click', async () => {
      const button = byId('copy-path-link');
      try {
        await navigator.clipboard.writeText(window.location.href);
        button.textContent = 'Link copied';
        window.setTimeout(() => { button.textContent = 'Copy shareable path link'; }, 1800);
      } catch (_) {
        button.textContent = 'Copy the URL from your address bar';
      }
    });
    window.addEventListener('resize', () => state.cy.resize());
  }

  async function start() {
    try {
      const response = await fetch('./data/curriculum.json');
      if (!response.ok) throw new Error(`Unable to load curriculum data (${response.status}). Run the curriculum build script first.`);
      state.data = await response.json();
      addOptions();
      initializeGraph();
      attachControls();
      byId('data-status').textContent = `${Object.keys(state.data.topics).length} topics · ${Object.keys(state.data.paths).length} paths`;
      applyFilters();
      const params = new URLSearchParams(window.location.search);
      const pathId = params.get('path');
      if (pathId && state.data.paths[pathId]) {
        byId('path-select').value = pathId;
        setActivePath(pathId);
      }
      const topicId = params.get('topic');
      if (topicId && state.data.topics[topicId]) selectTopic(topicId);
    } catch (error) {
      const loading = byId('graph-loading');
      loading.textContent = error.message || 'Could not load the curriculum explorer.';
      loading.classList.add('error');
    }
  }

  start();
})();
