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
  c.goReviewUnmatched = function() { c.server.get({ action: 'loadUnmatched' }).then(function(r) { 
    c.data.unmatched = r.data.unmatched; 
    c.data.noProduct = r.data.noProduct;
    c.data.unmatchedCount = r.data.unmatchedCount;
    c.data.noProductCount = r.data.noProductCount;
    c.setView('review-unmatched'); 
  }); };
  c.goGaps = function() { c.server.get({ action: 'loadGaps' }).then(function(r) { c.data.gapData = r.data.gapData; c.setView('gaps'); }); };

  // ─── SUPPLY / DEMAND ─────────────────────────────────
  c.runSupplyAnalysis = function() {
    c.running = true; c.progress = 10; c.runPhase = 'Classifying KB articles and catalog items...';
    c.data.action = 'runSupplyAnalysis';
    c.data.reportName = c.reportName || '';
    c.data.kbState = c.supplyFilters.kbState || 'published';
    c.data.limit = '10'; // Start small for testing
    c.server.update().then(function() {
      c.running = false;
      c.goReviewRegistry();
    });
  };
  c.runDemandAnalysis = function() {
    c.running = true; c.progress = 10; c.runPhase = 'Classifying incidents...';
    c.data.action = 'runDemandAnalysis';
    c.data.reportName = c.reportName || '';
    c.data.dateFrom = c.demandFilters.dateFrom || '';
    c.data.dateTo = c.demandFilters.dateTo || '';
    c.data.limit = c.demandFilters.limit || '50';
    c.server.update().then(function() {
      c.running = false;
      c.setView('review-unmatched');
    });
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

  // ─── RECORDS DRILL-DOWN MODAL ─────────────────────────
  c.recordsModal = null;
  c.openRecordsModal = function(topic, sourceType) {
    var label = sourceType === 'kb_knowledge' ? 'KB articles' : sourceType === 'sc_cat_item' ? 'Catalog items' : 'Incidents';
    c.recordsModal = { topic: topic, sourceType: sourceType, label: label, records: [], loading: true };
    c.server.get({
      action: 'loadRecords',
      topicSysId: topic.sys_id,
      productSysId: topic.product_sys_id,
      sourceType: sourceType
    }).then(function(r) {
      c.recordsModal.records = r.data.records || [];
      c.recordsModal.loading = false;
    });
  };
  c.closeRecordsModal = function() { c.recordsModal = null; };

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
    c.data.action = 'addProduct';
    c.data.companyName = c.newCompanyName;
    c.data.productName = c.newProductName;
    c.server.update().then(function() { c.showAddCompany = false; });
  };
  c.addProductFromUnmatched = function(companyName, productName) {
    c.data.action = 'addProduct';
    c.data.companyName = companyName;
    c.data.productName = productName;
    c.server.update().then(function() {
      c.server.get({ action: 'loadUnmatched' }).then(function(r) {
        c.data.unmatched = r.data.unmatched;
        c.data.noProduct = r.data.noProduct;
        c.data.unmatchedCount = r.data.unmatchedCount;
        c.data.noProductCount = r.data.noProductCount;
      });
    });
  };

  // ─── CLUSTER ASSIGNMENT (Step 5) ─────────────────────
  c.clusterAssign = {};

  c.toggleClusterAssign = function(topicSysId) {
    if (c.clusterAssign[topicSysId]) {
      c.clusterAssign[topicSysId] = null;
    } else {
      c.clusterAssign[topicSysId] = { mode: 'existing', productSysId: '', newCompany: '', newProduct: '' };
    }
  };

  c.assignExistingProduct = function(clusterKey) {
    var assign = c.clusterAssign[clusterKey];
    if (!assign || !assign.productSysId) return;
    c.data.action = 'assignProductToCluster';
    c.data.topicSysId = clusterKey.replace(/[^a-f0-9]/g, '').substring(0, 32); // extract topic sys_id
    c.data.productSysId = assign.productSysId;
    c.server.update().then(function() {
      c.clusterAssign[clusterKey] = null;
    });
  };

  c.assignExistingProductDirect = function(topicSysId, productSysId) {
    if (!topicSysId || !productSysId) return;
    c.data.action = 'assignProductToCluster';
    c.data.topicSysId = topicSysId;
    c.data.productSysId = productSysId;
    c.server.update().then(function() {});
  };

  c.createAndAssignProduct = function(clusterKey) {
    var assign = c.clusterAssign[clusterKey];
    if (!assign || !assign.newProduct) return;
    c.data.action = 'createAndAssignToCluster';
    c.data.topicSysId = clusterKey.replace(/[^a-f0-9]/g, '').substring(0, 32);
    c.data.companyName = assign.newCompany;
    c.data.productName = assign.newProduct;
    c.server.update().then(function() {
      c.clusterAssign[clusterKey] = null;
    });
  };

  c.getProductList = function() {
    if (!c.data.registry) return [];
    var list = [];
    for (var ci = 0; ci < c.data.registry.length; ci++) {
      for (var pi = 0; pi < c.data.registry[ci].products.length; pi++) {
        var p = c.data.registry[ci].products[pi];
        list.push({ sys_id: p.sys_id, label: c.data.registry[ci].name + ' - ' + (p.displayName || p.name) });
      }
    }
    return list;
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
