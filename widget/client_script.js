// CLIENT SCRIPT - v6.4: Fixed confirm, show/hide hidden, unhide
function() {
  var c = this;

  c.view = 'home';
  c.expanded = {};
  c.modal = null;
  c.search = '';
  c.reportName = '';
  c.running = false;
  c.progress = 0;
  c.runPhase = '';
  c.showHidden = false;
  c.supplyFilters = { kbState: 'published' };
  c.demandFilters = { dateFrom: '', dateTo: '', assignmentGroup: '', limit: '50' };

  // ─── NAVIGATION ──────────────────────────────────────
  c.setView = function(view) { c.view = view; c.expanded = {}; c.modal = null; c.search = ''; };
  c.goNewReport = function() { c.setView('new-report'); };
  c.goReports = function() { c.server.get({ action: 'loadReports' }).then(function(r) { c.data.reports = r.data.reports; c.setView('reports'); }); };
  c.goRegistry = function() { c.showHidden = false; c.server.get({ action: 'loadRegistry', includeHidden: 'false' }).then(function(r) { c.data.registry = r.data.registry; c.setView('registry'); }); };
  c.goReviewRegistry = function() { c.showHidden = false; c.server.get({ action: 'loadRegistry', includeHidden: 'false' }).then(function(r) { c.data.registry = r.data.registry; c.setView('review-registry'); }); };
  c.goSupplyResults = function() { c.server.get({ action: 'loadSupplyResults' }).then(function(r) { c.data.supplyData = r.data.supplyData; c.setView('supply-results'); }); };
  c.goReviewUnmatched = function() { c.server.get({ action: 'loadUnmatched' }).then(function(r) { c.data.unmatched = r.data.unmatched; c.setView('review-unmatched'); }); };
  c.goGaps = function() { c.server.get({ action: 'loadGaps' }).then(function(r) { c.data.gapData = r.data.gapData; c.setView('gaps'); }); };

  // ─── SUPPLY / DEMAND ─────────────────────────────────
  c.runSupplyAnalysis = function() {
    c.running = true; c.progress = 10; c.runPhase = 'Running supply analysis...';
    c.server.get({ action: 'loadSupplyResults' }).then(function(r) { c.data.supplyData = r.data.supplyData; c.running = false; c.goReviewRegistry(); });
  };
  c.runDemandAnalysis = function() {
    c.running = true; c.progress = 10; c.runPhase = 'Running demand analysis...';
    c.server.get({ action: 'loadGaps' }).then(function(r) { c.data.gapData = r.data.gapData; c.running = false; c.goReviewUnmatched(); });
  };
  c.openReport = function(report) { c.data.currentReport = report; c.goGaps(); };

  // ─── EXPAND/COLLAPSE & SEARCH ────────────────────────
  c.toggle = function(key) { c.expanded[key] = !c.expanded[key]; };
  c.isExpanded = function(key) { return c.expanded[key]; };
  c.matchesSearch = function(company) {
    if (!c.search || c.search.length < 2) return true;
    var s = c.search.toLowerCase();
    if (company.name.toLowerCase().indexOf(s) > -1) return true;
    for (var i = 0; i < company.products.length; i++) { if (company.products[i].name.toLowerCase().indexOf(s) > -1) return true; }
    return false;
  };
  c.matchesRegistrySearch = c.matchesSearch;

  // ─── MODAL ───────────────────────────────────────────
  c.openCoverageModal = function(topic) { c.modal = { topic: topic, rule: topic.rule || 'either' }; };
  c.closeModal = function() { c.modal = null; };
  c.saveCoverageRule = function() {
    if (!c.modal) return;
    c.server.get({ action: 'saveCoverageRule', topicSysId: c.modal.topic.sys_id, productSysId: c.modal.topic.product_sys_id, rule: c.modal.rule }).then(function() {
      var t = c.modal.topic; var rule = c.modal.rule; var gaps = [];
      if (rule === 'kb' && t.kb === 0) gaps.push('KB article');
      if (rule === 'catalog' && t.catalog === 0) gaps.push('Catalog item');
      if (rule === 'both') { if (t.kb === 0) gaps.push('KB article'); if (t.catalog === 0) gaps.push('Catalog item'); }
      if (rule === 'either' && t.kb === 0 && t.catalog === 0) gaps.push('Content');
      t.covered = (rule === 'none') || gaps.length === 0; t.gaps = gaps; t.rule = rule;
      c.closeModal();
    });
  };

  // ─── REGISTRY ACTIONS ───────────────────────────────
  c.reloadRegistry = function() {
    c.data.action = 'loadRegistry';
    c.data.includeHidden = c.showHidden ? 'true' : 'false';
    c.server.update().then(function() {
      // c.data is automatically updated by server.update()
    });
  };
  c.confirmProduct = function(productSysId) {
    c.data.action = 'confirmProduct';
    c.data.productSysId = productSysId;
    c.server.update().then(function() {
      // registry auto-updated in c.data
    });
  };
  c.confirmAllForCompany = function(companyName) {
    c.data.action = 'confirmAllForCompany';
    c.data.companyName = companyName;
    c.server.update().then(function() {
      // registry auto-updated in c.data
    });
  };
  c.hideProduct = function(productSysId) {
    c.data.action = 'hideProduct';
    c.data.productSysId = productSysId;
    c.server.update().then(function() {
      // registry auto-updated in c.data
    });
  };
  c.unhideProduct = function(productSysId) {
    c.data.action = 'unhideProduct';
    c.data.productSysId = productSysId;
    c.server.update().then(function() {
      // registry auto-updated in c.data
    });
  };
  c.toggleShowHidden = function() {
    // ng-model already updated c.showHidden, just reload
    c.reloadRegistry();
  };

  c.showAddCompany = false;
  c.newCompanyName = '';
  c.newProductName = '';
  c.toggleAddCompany = function() { c.showAddCompany = !c.showAddCompany; c.newCompanyName = ''; c.newProductName = ''; };
  c.addProduct = function() {
    if (!c.newCompanyName || !c.newProductName) return;
    c.server.get({ action: 'addProduct', companyName: c.newCompanyName, productName: c.newProductName }).then(function(r) { c.showAddCompany = false; c.data.registry = r.data.registry; });
  };

  // ─── STATS ──────────────────────────────────────────
  c.getGapStats = function() {
    if (!c.data.gapData || !c.data.gapData.companies) return { topics: 0, gaps: 0, covered: 0, incidents: 0, pct: 0 };
    var topics = 0, gaps = 0, covered = 0, incidents = 0;
    for (var ci = 0; ci < c.data.gapData.companies.length; ci++) for (var pi = 0; pi < c.data.gapData.companies[ci].products.length; pi++) for (var ti = 0; ti < c.data.gapData.companies[ci].products[pi].topics.length; ti++) {
      var t = c.data.gapData.companies[ci].products[pi].topics[ti];
      if (t.incidents > 0) { topics++; incidents += t.incidents; if (t.covered) covered++; else gaps++; }
    }
    return { topics: topics, gaps: gaps, covered: covered, incidents: incidents, pct: topics > 0 ? Math.round((covered / topics) * 100) : 0 };
  };
  c.getSupplyStats = function() {
    if (!c.data.supplyData || !c.data.supplyData.companies) return { kb: 0, catalog: 0, products: 0, topics: 0 };
    var kb = 0, catalog = 0, products = 0, topics = 0;
    for (var ci = 0; ci < c.data.supplyData.companies.length; ci++) for (var pi = 0; pi < c.data.supplyData.companies[ci].products.length; pi++) {
      products++;
      for (var ti = 0; ti < c.data.supplyData.companies[ci].products[pi].topics.length; ti++) { topics++; kb += c.data.supplyData.companies[ci].products[pi].topics[ti].kb; catalog += c.data.supplyData.companies[ci].products[pi].topics[ti].catalog; }
    }
    return { kb: kb, catalog: catalog, products: products, topics: topics };
  };
}
