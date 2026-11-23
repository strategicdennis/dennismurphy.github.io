// Batch files are loaded once per page. The inline catalog keeps links and counts usable
// before the evidence records arrive.
const pendingAuditFiles = new Map();
const loadedAuditFiles = new Set();
const sharedRecordsByPosition = new Map();
const offlineAuditFiles = new Map();
let paneRequest = 0;
let paneDataStatus = '';
let retryAuditPane;
let exportDataStatus = '';
let exportInProgress = false;

function auditDataNotice() {
  const offline = location.protocol === 'file:' && !offlineAuditFiles.size;
  const message = exportDataStatus || paneDataStatus ||
    (offline ? 'Choose the sourceaudit-data folder beside this dashboard to open records offline.' : '');
  document.getElementById('dashboardDataBanner').classList.toggle('hidden', !message);
  document.getElementById('dashboardDataMessage').textContent = message;
  document.getElementById('dashboardDataFileLabel').classList.toggle('hidden', location.protocol !== 'file:');
  document.getElementById('dashboardDataRetry').classList.toggle('hidden', !paneDataStatus.startsWith('Could not') || offline);
}

function applyAuditFile(name, data) {
  const batch = name.match(/^batch-(\d+)(-footnotes(?:-\d+)?)?$/);
  if (!batch) {
    if (!Array.isArray(data.records)) throw new Error('Invalid shared source data');
    for (const [position, source] of data.records) sharedRecordsByPosition.set(position, source);
    DATA.shared_sources = Array.from(sharedRecordsByPosition)
      .sort(([a], [b]) => a - b)
      .map(([, source]) => source);
    return;
  }
  const papers = DATA.papers.filter(p => DATA_INDEX.paperBatches[p.code] === String(Number(batch[1])));
  if (batch[2]) {
    if (!data.rows) throw new Error('Invalid footnote data');
    const footnotePapers = papers.filter(paper => DATA_INDEX.paperFootnoteFiles[paper.code] === name);
    const records = footnotePapers.map(paper => {
      const entries = data.rows[paper.code] || [];
      if (entries.length !== DATA_INDEX.coverage[paper.code].sources ||
          entries.some(row => !Array.isArray(row) || row.length < 9 ||
            DATA_INDEX.rowLocations[row[0]]?.[0] !== paper.code ||
            DATA_INDEX.rowLocations[row[0]]?.[1] !== 'footnote')) {
        throw new Error('The footnote data does not match this dashboard.');
      }
      return entries.map(a => ({
        id: a[0], status: a[1], source: a[2], shared_key: a[3], usage: a[4], finding: a[5],
        n: a[6], seg: a[7], basis: a[8], ns: a[9], aliases: a[10], flag: a[11] || '',
        family_review: a[12], source_review: a[14],
        evidence: a[13] || a[12]?.underlying_source_check?.records
          .filter(record => record.url).map(record => [record.label, record.url]),
        fn: 1
      }));
    });
    footnotePapers.forEach((paper, index) => {
      paper.fnrows = records[index];
      paper.fnrows.forEach(classifyAuditRow);
    });
    return;
  }
  for (const paper of papers) {
    const part = data.papers?.[paper.code];
    if (!Array.isArray(part?.rows) || part.rows.length !== DATA_INDEX.coverage[paper.code].claims.all ||
        part.rows.some(row => DATA_INDEX.rowLocations[row.id]?.[0] !== paper.code ||
          DATA_INDEX.rowLocations[row.id]?.[1] !== 'claim')) {
      throw new Error('The claim data does not match this dashboard.');
    }
  }
  for (const paper of papers) {
    Object.assign(paper, data.papers[paper.code]);
    paper.rows.forEach(classifyAuditRow);
  }
  Object.assign(DATA.meta, data.meta);
}

async function readAuditFile(name) {
  const filename = name + '.json';
  let bytes;
  if (location.protocol === 'file:') {
    const file = offlineAuditFiles.get(filename);
    if (!file) throw new Error(filename + ' is missing from the selected folder');
    bytes = await file.arrayBuffer();
  } else {
    const response = await fetch('sourceaudit-data/' + filename + '?v=' + DATA_INDEX.files[name]);
    if (!response.ok) throw new Error(filename + ' returned HTTP ' + response.status);
    bytes = await response.arrayBuffer();
  }
  const contents = new TextDecoder('utf-8', {ignoreBOM: true}).decode(bytes);
  if (crypto.subtle) {
    const canonical = contents.includes('\r\n')
      ? new TextEncoder().encode(contents.replaceAll('\r\n', '\n'))
      : bytes;
    const digest = await crypto.subtle.digest('SHA-256', canonical);
    const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (checksum !== DATA_INDEX.files[name]) throw new Error(filename + ' belongs to a different dashboard version');
  }
  return JSON.parse(contents.replace(/^\uFEFF/, ''));
}

function loadAuditFile(name) {
  if (loadedAuditFiles.has(name)) return Promise.resolve();
  if (pendingAuditFiles.has(name)) return pendingAuditFiles.get(name);
  const promise = readAuditFile(name).then(data => {
    applyAuditFile(name, data);
    loadedAuditFiles.add(name);
    if (Object.values(DATA_INDEX.batches).flatMap(batch => batch.footnotes).every(file => loadedAuditFiles.has(file))) {
      for (const paper of DATA.papers) paper.fnrows ??= [];
      DATA.fnLoaded = true;
    }
  }).finally(() => pendingAuditFiles.delete(name));
  pendingAuditFiles.set(name, promise);
  return promise;
}

function auditFilesForPane() {
  const batchScope = state.batchFilter === 'all' ? Object.keys(DATA_INDEX.batches) : [state.batchFilter];
  if (state.activeTab === 'shared') {
    return state.batchFilter === 'all' ? DATA_INDEX.sharedFiles : DATA_INDEX.sharedByBatch[state.batchFilter];
  }
  if (state.activeTab === 'rows') {
    const paperBatch = DATA_INDEX.paperBatches[state.rowPaperFilter];
    const inScope = paperBatch ? batchScope.filter(batch => batch === paperBatch) : batchScope;
    const files = inScope.flatMap(number => {
      const batch = DATA_INDEX.batches[number];
      return [
        ...(state.rowType !== 'footnote' || state.searchQuery ? [batch.analysis] : []),
        ...(state.rowType !== 'claim' ? (paperBatch ? batch.footnotes.filter(name => DATA_INDEX.paperFootnoteFiles[state.rowPaperFilter] === name) : batch.footnotes) : [])
      ];
    });
    if (state.rowQuery.toLowerCase().startsWith('src-fn-')) files.push('shared-common');
    return files;
  }
  if (state.searchQuery) return batchScope.map(batch => DATA_INDEX.batches[batch].analysis);
  if (state.activeTab === 'papers') {
    return [...new Set(DATA.papers
      .filter(paper => state.expandedPapers.has(paper.reading_order) &&
        batchScope.includes(DATA_INDEX.paperBatches[paper.code]))
      .map(paper => DATA_INDEX.batches[DATA_INDEX.paperBatches[paper.code]].analysis))];
  }
  return [];
}

function renderAuditPane(render, files, suppressStale) {
  const request = ++paneRequest;
  retryAuditPane = () => renderAuditPane(render, files, suppressStale);
  const needed = files.filter(name => !loadedAuditFiles.has(name));
  paneDataStatus = '';
  if (!needed.length) {
    auditDataNotice();
    render();
    return;
  }
  suppressStale();
  if (location.protocol === 'file:' && !offlineAuditFiles.size) {
    auditDataNotice();
    return;
  }
  paneDataStatus = 'Loading dashboard records…';
  auditDataNotice();
  Promise.all(needed.map(loadAuditFile)).then(() => {
    if (request !== paneRequest) return;
    paneDataStatus = '';
    auditDataNotice();
    render();
  }).catch(error => {
    if (request !== paneRequest) return;
    console.warn(error);
    paneDataStatus = 'Could not load the dashboard records for this view. ' +
      (location.protocol === 'file:' ? 'Choose the sourceaudit-data folder that came with this dashboard.' : 'Retry to load them again.');
    auditDataNotice();
  });
}

async function runAuditExport(button, includeShared, exportRecords) {
  if (exportInProgress) return;
  if (location.protocol === 'file:' && !offlineAuditFiles.size) {
    auditDataNotice();
    document.getElementById('dashboardDataFile').focus();
    return;
  }
  const files = Object.values(DATA_INDEX.batches).flatMap(batch => [batch.analysis, ...batch.footnotes]);
  if (includeShared) files.push(...DATA_INDEX.sharedFiles);
  exportInProgress = true;
  exportDataStatus = 'Preparing the full export…';
  button.setAttribute('aria-busy', 'true');
  auditDataNotice();
  try {
    await Promise.all(files.map(loadAuditFile));
    if (includeShared && DATA.shared_sources.length !== DATA_INDEX.sharedCount) {
      throw new Error('The shared source export is incomplete.');
    }
    exportRecords();
    exportDataStatus = '';
  } catch (error) {
    console.warn(error);
    exportDataStatus = 'Could not prepare the full export. Select the export again to retry.';
  } finally {
    exportInProgress = false;
    button.removeAttribute('aria-busy');
    auditDataNotice();
  }
}

function registerAuditDataControls() {
  document.getElementById('dashboardDataRetry').addEventListener('click', () => retryAuditPane?.());
  const input = document.getElementById('dashboardDataFile');
  input.addEventListener('change', () => {
    if (!input.files.length) return;
    offlineAuditFiles.clear();
    for (const file of input.files) offlineAuditFiles.set(file.name, file);
    const missing = Object.keys(DATA_INDEX.files).some(name => !offlineAuditFiles.has(name + '.json'));
    if (missing) {
      offlineAuditFiles.clear();
      paneDataStatus = 'Could not find all the dashboard data files. Choose the sourceaudit-data folder.';
      auditDataNotice();
      return;
    }
    exportDataStatus = '';
    input.value = '';
    if (retryAuditPane) retryAuditPane();
    else renderAll();
  });
}
