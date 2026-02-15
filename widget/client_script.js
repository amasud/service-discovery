// CLIENT SCRIPT - v5: Matches approved preview v6
function() {
  var c = this;

  c.view = 'home';
  c.expanded = {};
  c.facet = 'gaps';
  c.ownerFilter = '';
  c.showSuggestions = false;
  c.modal = null;
  c.runName = '';
  c.running = false;
  c.progress = 0;
  c.runPhase = '';
  c.regTab = 'registry';
  c.regSearch = '';
  c.showAddCompany = false;
  c.newCompany = '';
  c.newProducts = '';
  c.selectedRunId = c.data.selectedRunId || '';

  c.runFilters = {
    dateFrom: '',
    dateTo: '',
    assignmentGroup: '',
    kbName: '',
    kbState: 'published',
    catalogName: ''
  };

  // ─── NAVIGATION ──────────────────────────────────────
  c.setView = function(view) { c.view = view; c.expanded = {}; c.modal = null; };

  // ─── RUN SELECTION ───────────────────────────────────
  c.selectRun = function(runSysId) {
    c.selectedRunId = runSysId;
    c.server.get({ action: 'loadRun', selectedRunId: runSysId }).then(function(response) {
      c.data.categories = response.data.categories;
      c.data.totalTopics = response.data.totalTopics;
      c.data.totalGaps = response.data.totalGaps;
      c.data.totalCovered = response.data.totalCovered;
      c.data.coverPct = response.data.coverPct;
      c.data.catCount = response.data.catCount;
    });
  };

  c.openRun = function(run) {
    c.selectRun(run.sys_id);
    c.setView('dashboard');
  };

  // ─── DASHBOARD ───────────────────────────────────────
  c.toggleCategory = function(catName) { c.expanded[catName] = !c.expanded[catName]; };
  c.setFacet = function(f) { c.facet = f; };
  c.setOwnerFilter = function(val) { c.ownerFilter = val; c.expanded = {}; };
  c.clearFilter = function() { c.ownerFilter = ''; c.expanded = {}; };

  // ─── MODALS ──────────────────────────────────────────
  c.closeModal = function() { c.modal = null; };
  c.openDemandModal = function(topic) { c.modal = { type: 'demand', topic: topic, product: null, incidents: topic.incidents || [] }; };
  c.openSupplyModal = function(topic) { c.modal = { type: 'supply', topic: topic, product: null, isGap: topic.kbGap || topic.catGap, incidents: topic.incidents || [] }; };
  c.openProductDemand = function(topic, prod) { c.modal = { type: 'demand', topic: topic, product: prod, incidents: prod.incidents || [] }; };
  c.openProductSupply = function(topic, prod) { c.modal = { type: 'supply', topic: topic, product: prod, isGap: prod.kbGap || prod.catGap, incidents: prod.incidents || [] }; };

  // ─── FILTER HELPERS ──────────────────────────────────
  c.getFilteredCategories = function() {
    if (!c.ownerFilter) return c.data.categories;
    var fl = c.ownerFilter.toLowerCase();
    var result = [];
    for (var i = 0; i < c.data.categories.length; i++) {
      var cat = c.data.categories[i];
      var matched = [];
      for (var j = 0; j < cat.topics.length; j++) {
        var t = cat.topics[j];
        var topicMatch = t.name.toLowerCase().indexOf(fl) > -1;
        var productMatch = false;
        if (t.products) {
          for (var k = 0; k < t.products.length; k++) {
            if (t.products[k].product.toLowerCase().indexOf(fl) > -1 || t.products[k].company.toLowerCase().indexOf(fl) > -1) { productMatch = true; break; }
          }
        }
        if (topicMatch || productMatch) matched.push(t);
      }
      if (matched.length > 0) {
        var clone = JSON.parse(JSON.stringify(cat));
        clone.topics = matched;
        clone.topicCount = matched.length;
        var gaps = 0;
        for (var m = 0; m < matched.length; m++) { if (matched[m].kbGap || matched[m].catGap) gaps++; }
        clone.gapCount = gaps;
        clone.coveredCount = matched.length - gaps;
        result.push(clone);
      }
    }
    return result;
  };

  c.getFilteredTopics = function(topics) {
    if (c.facet === 'all') return topics;
    var result = [];
    for (var i = 0; i < topics.length; i++) { if (topics[i].kbGap || topics[i].catGap) result.push(topics[i]); }
    return result;
  };

  // ─── GAP COUNT HELPERS ───────────────────────────────
  c.getCatKbGaps = function(cat) {
    var count = 0;
    for (var i = 0; i < cat.topics.length; i++) { if (cat.topics[i].kbGap) count++; }
    return count;
  };

  c.getCatCatGaps = function(cat) {
    var count = 0;
    for (var i = 0; i < cat.topics.length; i++) { if (cat.topics[i].catGap) count++; }
    return count;
  };

  c.getCoveragePct = function(cat) {
    if (cat.topicCount === 0) return 0;
    return Math.round((cat.coveredCount / cat.topicCount) * 100);
  };

  c.getBarColor = function(pct) {
    if (pct >= 75) return '#00875A';
    if (pct >= 25) return '#FF991F';
    return '#DE350B';
  };

  c.getFilteredStats = function() {
    var cats = c.getFilteredCategories();
    var topics = 0, gaps = 0, covered = 0;
    for (var i = 0; i < cats.length; i++) { topics += cats[i].topicCount; gaps += cats[i].gapCount; covered += cats[i].coveredCount; }
    return { catCount: cats.length, topics: topics, gaps: gaps, covered: covered, pct: topics > 0 ? Math.round((covered / topics) * 100) : 0 };
  };

  // v5: Live stats with KB/Cat breakdown
  c.getLiveStats = function() {
    var cats = c.data.categories;
    var totalTopics = 0, totalGaps = 0, totalCovered = 0, kbGaps = 0, catGaps = 0;
    for (var i = 0; i < cats.length; i++) {
      for (var j = 0; j < cats[i].topics.length; j++) {
        totalTopics++;
        var t = cats[i].topics[j];
        if (t.kbGap || t.catGap) { totalGaps++; if (t.kbGap) kbGaps++; if (t.catGap) catGaps++; }
        else { totalCovered++; }
      }
    }
    return { catCount: cats.length, topics: totalTopics, gaps: totalGaps, covered: totalCovered, kbGaps: kbGaps, catGaps: catGaps, pct: totalTopics > 0 ? Math.round((totalCovered / totalTopics) * 100) : 0 };
  };

  c.getSelectedRun = function() {
    if (!c.selectedRunId) return null;
    for (var i = 0; i < c.data.runs.length; i++) { if (c.data.runs[i].sys_id === c.selectedRunId) return c.data.runs[i]; }
    return null;
  };

  // ─── REGISTRY SEARCH ────────────────────────────────
  c.matchesRegSearch = function(co) {
    if (!c.regSearch || c.regSearch.length < 2) return true;
    var fl = c.regSearch.toLowerCase();
    if (co.name.toLowerCase().indexOf(fl) > -1) return true;
    for (var i = 0; i < co.products.length; i++) { if (co.products[i].toLowerCase().indexOf(fl) > -1) return true; }
    return false;
  };

  // ─── NEW RUN ─────────────────────────────────────────
  c.startRun = function() {
    if (!c.runName) return;
    c.running = true;
    c.progress = 10;
    c.runPhase = 'creating';

    c.server.get({
      action: 'startRun',
      runName: c.runName,
      sources: JSON.stringify({ incidents: true, kb: true, catalog: true }),
      filters: JSON.stringify(c.runFilters)
    }).then(function(response) {
      c.progress = 30;
      c.runPhase = 'classifying';
      if (response.data.runSysId) {
        c.pollRunStatus(response.data.runSysId);
      } else {
        c.running = false;
        c.runPhase = 'error';
      }
    });
  };

  c.pollRunStatus = function(runSysId) {
    var pollInterval = setInterval(function() {
      c.server.get({ action: 'checkRunStatus', runSysId: runSysId }).then(function(response) {
        var status = response.data.runStatus;
        var pct = response.data.runProgress || c.progress;
        c.progress = pct;
        if (pct > 40) c.runPhase = 'extracting';
        if (pct > 70) c.runPhase = 'matching';
        if (status === 'Complete' || pct >= 100) {
          clearInterval(pollInterval);
          c.progress = 100;
          c.running = false;
          c.server.get({ action: 'loadRuns' }).then(function(runsResponse) {
            c.data.runs = runsResponse.data.runs;
            c.selectedRunId = runSysId;
            c.setView('registry');
          });
        } else if (status === 'Error') {
          clearInterval(pollInterval);
          c.running = false;
          c.runPhase = 'error';
        }
      });
    }, 3000);
  };

  // ─── REGISTRY ────────────────────────────────────────
  c.confirmCompany = function(idx) { if (c.data.companyList[idx]) c.data.companyList[idx].confirmed = true; };
  c.confirmAll = function() { for (var i = 0; i < c.data.companyList.length; i++) c.data.companyList[i].confirmed = true; };
  c.removeCompany = function(idx) { c.data.companyList.splice(idx, 1); };
  c.toggleAddCompany = function() { c.showAddCompany = !c.showAddCompany; c.newCompany = ''; c.newProducts = ''; };
  c.addCompany = function() {
    if (!c.newCompany) return;
    var prods = c.newProducts ? c.newProducts.split(',').map(function(p) { return p.trim(); }).filter(function(p) { return p; }) : [];
    c.data.companyList.push({ name: c.newCompany, products: prods, totalMentions: 0, confirmed: true });
    c.showAddCompany = false;
  };
  c.editCompany = function(idx) {
    var co = c.data.companyList[idx];
    co.editing = true;
    co.editName = co.name;
    co.editProducts = co.products.join(', ');
  };
  c.saveCompanyEdit = function(idx) {
    var co = c.data.companyList[idx];
    co.name = co.editName;
    co.products = co.editProducts ? co.editProducts.split(',').map(function(p) { return p.trim(); }).filter(function(p) { return p; }) : [];
    co.editing = false;
  };
}
