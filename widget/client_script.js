// CLIENT SCRIPT - v4.2
// CHANGES:
//   1. startRun → on complete navigates to registry (not dashboard)
//   2. editCompany / saveCompanyEdit for inline registry editing
//   3. getLiveStats() computes summary from actual displayed data
//   4. Added runFilters defaults for new filter fields (state, priority, kb, catalog)
//   5. Facet filter fixed (was not toggling properly in some cases)

function() {
  var c = this;

  c.view = 'home';
  c.expanded = {};
  c.facet = 'gaps';
  c.ownerFilter = '';
  c.showSuggestions = false;
  c.modal = null;
  c.runSources = { incidents: false, kb: false, catalog: false };
  c.runName = '';
  c.running = false;
  c.progress = 0;
  c.runPhase = '';
  c.regTab = 'registry';
  c.showAddCompany = false;
  c.newCompany = '';
  c.newProducts = '';
  c.newOwner = '';
  c.selectedRunId = c.data.selectedRunId || '';

  // v4.2: Extended filter defaults
  c.runFilters = {
    dateRange: '30',
    assignmentGroup: '',
    category: '',
    state: '',
    priority: '',
    limit: '100',
    kbName: '',
    kbState: 'published',
    kbCategory: '',
    kbLimit: '100',
    catalogName: '',
    catalogCategory: '',
    catalogActive: 'true',
    catalogLimit: '100'
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
  c.setOwnerFilter = function(val) { c.ownerFilter = val; c.expanded = {}; c.showSuggestions = val.length > 0; };
  c.selectSuggestion = function(val) { c.ownerFilter = val; c.showSuggestions = false; c.expanded = {}; };
  c.clearFilter = function() { c.ownerFilter = ''; c.expanded = {}; c.showSuggestions = false; };
  c.hideSuggestions = function() { setTimeout(function() { c.showSuggestions = false; }, 200); };

  // ─── MODALS ──────────────────────────────────────────
  c.closeModal = function() { c.modal = null; };

  c.openDemandModal = function(topic) {
    c.modal = { type: 'demand', topic: topic, product: null, incidents: topic.incidents || [] };
  };

  c.openSupplyModal = function(topic) {
    var isGap = topic.kbGap || topic.catGap;
    c.modal = { type: 'supply', topic: topic, product: null, isGap: isGap, incidents: topic.incidents || [] };
  };

  c.openProductDemand = function(topic, prod) {
    c.modal = { type: 'demand', topic: topic, product: prod, incidents: prod.incidents || [] };
  };

  c.openProductSupply = function(topic, prod) {
    var isGap = prod.kbGap || prod.catGap;
    c.modal = { type: 'supply', topic: topic, product: prod, isGap: isGap, incidents: prod.incidents || [] };
  };

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
            var p = t.products[k];
            if (p.product.toLowerCase().indexOf(fl) > -1 || p.company.toLowerCase().indexOf(fl) > -1) {
              productMatch = true;
              break;
            }
          }
        }
        if (topicMatch || productMatch) matched.push(t);
      }
      if (matched.length > 0) {
        var clone = JSON.parse(JSON.stringify(cat));
        clone.topics = matched;
        clone.topicCount = matched.length;
        var gaps = 0;
        for (var m = 0; m < matched.length; m++) {
          if (matched[m].kbGap || matched[m].catGap) gaps++;
        }
        clone.gapCount = gaps;
        clone.coveredCount = matched.length - gaps;
        result.push(clone);
      }
    }
    return result;
  };

  c.getFilteredTopics = function(topics) {
    if (c.facet === 'all') return topics;
    // Gaps only mode
    var result = [];
    for (var i = 0; i < topics.length; i++) {
      if (topics[i].kbGap || topics[i].catGap) result.push(topics[i]);
    }
    return result;
  };

  c.getGapLabel = function(topic) {
    if (topic.kbGap && topic.catGap) return 'KB + Catalog Item';
    if (topic.kbGap) return 'KB Article';
    if (topic.catGap) return 'Catalog Item';
    return null;
  };

  c.getCoveragePct = function(cat) {
    if (cat.topicCount === 0) return 0;
    return Math.round((cat.coveredCount / cat.topicCount) * 100);
  };

  c.getBarColor = function(pct) {
    if (pct >= 75) return '#2E7D57';
    if (pct >= 25) return '#E8983E';
    return '#C94040';
  };

  c.getSuggestions = function() {
    if (!c.ownerFilter || c.ownerFilter.length < 2) return [];
    var fl = c.ownerFilter.toLowerCase();
    var seen = {};
    var result = [];
    for (var r = 0; r < c.data.registry.length; r++) {
      var reg = c.data.registry[r];
      if (reg.name.toLowerCase().indexOf(fl) > -1 && !seen[reg.name]) { seen[reg.name] = true; result.push(reg.name); }
      if (reg.company && reg.company.toLowerCase().indexOf(fl) > -1 && !seen[reg.company]) { seen[reg.company] = true; result.push(reg.company); }
    }
    for (var i = 0; i < c.data.categories.length; i++) {
      for (var j = 0; j < c.data.categories[i].topics.length; j++) {
        var t = c.data.categories[i].topics[j];
        if (t.name.toLowerCase().indexOf(fl) > -1 && !seen[t.name]) { seen[t.name] = true; result.push(t.name); }
      }
    }
    return result.slice(0, 8);
  };

  c.getFilteredStats = function() {
    var cats = c.getFilteredCategories();
    var topics = 0, gaps = 0, covered = 0;
    for (var i = 0; i < cats.length; i++) { topics += cats[i].topicCount; gaps += cats[i].gapCount; covered += cats[i].coveredCount; }
    return { catCount: cats.length, topics: topics, gaps: gaps, covered: covered, pct: topics > 0 ? Math.round((covered / topics) * 100) : 0 };
  };

  // v4.2: Live stats that match what the table actually shows
  c.getLiveStats = function() {
    var cats = c.data.categories;
    var totalTopics = 0, totalGaps = 0, totalCovered = 0;
    for (var i = 0; i < cats.length; i++) {
      for (var j = 0; j < cats[i].topics.length; j++) {
        totalTopics++;
        if (cats[i].topics[j].kbGap || cats[i].topics[j].catGap) {
          totalGaps++;
        } else {
          totalCovered++;
        }
      }
    }
    return {
      catCount: cats.length,
      topics: totalTopics,
      gaps: totalGaps,
      covered: totalCovered,
      pct: totalTopics > 0 ? Math.round((totalCovered / totalTopics) * 100) : 0
    };
  };

  c.getSelectedRun = function() {
    if (!c.selectedRunId) return null;
    for (var i = 0; i < c.data.runs.length; i++) {
      if (c.data.runs[i].sys_id === c.selectedRunId) return c.data.runs[i];
    }
    return null;
  };

  // ─── NEW RUN ─────────────────────────────────────────
  c.toggleSource = function(key) { c.runSources[key] = !c.runSources[key]; };
  c.hasAnySources = function() { return c.runSources.incidents || c.runSources.kb || c.runSources.catalog; };
  c.getSourceCount = function() { var ct = 0; if (c.runSources.incidents) ct++; if (c.runSources.kb) ct++; if (c.runSources.catalog) ct++; return ct; };

  // v4.2: Real run → navigates to registry on complete
  c.startRun = function() {
    if (!c.hasAnySources()) return;
    c.running = true;
    c.progress = 10;
    c.runPhase = 'creating';

    c.server.get({
      action: 'startRun',
      runName: c.runName || 'Analysis - ' + new Date().toLocaleString(),
      sources: JSON.stringify(c.runSources),
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

          // Reload runs list, select new run, go to REGISTRY
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
  c.setRegTab = function(tab) { c.regTab = tab; };
  c.confirmCompany = function(idx) { if (c.data.companyList[idx]) c.data.companyList[idx].confirmed = true; };
  c.confirmAll = function() { for (var i = 0; i < c.data.companyList.length; i++) c.data.companyList[i].confirmed = true; };
  c.removeCompany = function(idx) { c.data.companyList.splice(idx, 1); };
  c.toggleAddCompany = function() { c.showAddCompany = !c.showAddCompany; c.newCompany = ''; c.newProducts = ''; c.newOwner = ''; };
  c.addCompany = function() {
    if (!c.newCompany) return;
    var prods = c.newProducts ? c.newProducts.split(',').map(function(p) { return p.trim(); }).filter(function(p) { return p; }) : [];
    c.data.companyList.push({ name: c.newCompany, products: prods, totalMentions: 0, confirmed: true });
    c.showAddCompany = false;
  };

  // v4.2: Edit company inline
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
