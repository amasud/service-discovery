// CLIENT SCRIPT - v6: New flow with Company → Product → Topic hierarchy
function() {
  var c = this;

  c.view = 'home';
  c.expanded = {};
  c.modal = null;
  c.search = '';
  c.reportName = '';

  // Filters
  c.supplyFilters = { kbState: 'published', catalogActive: 'true' };
  c.demandFilters = { dateFrom: '', dateTo: '', assignmentGroup: '', limit: '50' };

  // ─── NAVIGATION ──────────────────────────────────────
  c.setView = function(view) {
    c.view = view;
    c.expanded = {};
    c.modal = null;
    c.search = '';
  };

  // ─── HOME ────────────────────────────────────────────
  c.goNewReport = function() { c.setView('new-report'); };
  c.goReports = function() {
    c.server.get({ action: 'loadReports' }).then(function(r) {
      c.data.reports = r.data.reports;
      c.setView('reports');
    });
  };
  c.goRegistry = function() {
    c.server.get({ action: 'loadRegistry' }).then(function(r) {
      c.data.registry = r.data.registry;
      c.setView('registry');
    });
  };

  // ─── SUPPLY RESULTS ──────────────────────────────────
  c.loadSupplyResults = function(runSysId) {
    c.server.get({ action: 'loadSupplyResults', runSysId: runSysId || '' }).then(function(r) {
      c.data.supplyData = r.data.supplyData;
      c.setView('supply-results');
    });
  };

  // ─── GAPS ────────────────────────────────────────────
  c.loadGaps = function(runSysId) {
    c.server.get({ action: 'loadGaps', runSysId: runSysId || '' }).then(function(r) {
      c.data.gapData = r.data.gapData;
      c.setView('gaps');
    });
  };

  // ─── REPORT DETAIL ───────────────────────────────────
  c.openReport = function(report) {
    c.data.currentReport = report;
    c.loadGaps(report.sys_id);
  };

  // ─── EXPAND/COLLAPSE ────────────────────────────────
  c.toggle = function(key) { c.expanded[key] = !c.expanded[key]; };
  c.isExpanded = function(key) { return c.expanded[key]; };

  // ─── SEARCH FILTER ───────────────────────────────────
  c.matchesSearch = function(company) {
    if (!c.search || c.search.length < 2) return true;
    var s = c.search.toLowerCase();
    if (company.name.toLowerCase().indexOf(s) > -1) return true;
    for (var i = 0; i < company.products.length; i++) {
      if (company.products[i].name.toLowerCase().indexOf(s) > -1) return true;
    }
    return false;
  };

  // ─── MODAL ───────────────────────────────────────────
  c.openCoverageModal = function(topic) {
    c.modal = {
      topic: topic,
      rule: topic.rule || 'either'
    };
  };
  c.closeModal = function() { c.modal = null; };

  c.saveCoverageRule = function() {
    if (!c.modal) return;
    c.server.get({
      action: 'saveCoverageRule',
      topicSysId: c.modal.topic.sys_id,
      productSysId: c.modal.topic.product_sys_id,
      rule: c.modal.rule
    }).then(function() {
      c.modal.topic.rule = c.modal.rule;
      c.closeModal();
    });
  };

  // ─── REGISTRY ACTIONS ───────────────────────────────
  c.confirmProduct = function(productSysId) {
    c.server.get({ action: 'confirmProduct', productSysId: productSysId }).then(function() {
      c.goRegistry();
    });
  };

  c.removeProduct = function(productSysId) {
    c.server.get({ action: 'removeProduct', productSysId: productSysId }).then(function() {
      c.goRegistry();
    });
  };

  c.showAddCompany = false;
  c.newCompanyName = '';
  c.newProductName = '';

  c.toggleAddCompany = function() {
    c.showAddCompany = !c.showAddCompany;
    c.newCompanyName = '';
    c.newProductName = '';
  };

  c.addProduct = function() {
    if (!c.newCompanyName || !c.newProductName) return;
    c.server.get({
      action: 'addProduct',
      companyName: c.newCompanyName,
      productName: c.newProductName
    }).then(function() {
      c.showAddCompany = false;
      c.goRegistry();
    });
  };

  // ─── GAP STATS ──────────────────────────────────────
  c.getGapStats = function() {
    if (!c.data.gapData || !c.data.gapData.companies) return { topics: 0, gaps: 0, covered: 0, incidents: 0, pct: 0 };
    var topics = 0, gaps = 0, covered = 0, incidents = 0;
    for (var ci = 0; ci < c.data.gapData.companies.length; ci++) {
      var comp = c.data.gapData.companies[ci];
      for (var pi = 0; pi < comp.products.length; pi++) {
        var prod = comp.products[pi];
        for (var ti = 0; ti < prod.topics.length; ti++) {
          var t = prod.topics[ti];
          if (t.incidents > 0) {
            topics++;
            incidents += t.incidents;
            if (t.covered) covered++;
            else gaps++;
          }
        }
      }
    }
    return { topics: topics, gaps: gaps, covered: covered, incidents: incidents, pct: topics > 0 ? Math.round((covered / topics) * 100) : 0 };
  };

  c.getSupplyStats = function() {
    if (!c.data.supplyData || !c.data.supplyData.companies) return { kb: 0, catalog: 0, products: 0, topics: 0 };
    var kb = 0, catalog = 0, products = 0, topics = 0;
    for (var ci = 0; ci < c.data.supplyData.companies.length; ci++) {
      for (var pi = 0; pi < c.data.supplyData.companies[ci].products.length; pi++) {
        products++;
        var prod = c.data.supplyData.companies[ci].products[pi];
        for (var ti = 0; ti < prod.topics.length; ti++) {
          topics++;
          kb += prod.topics[ti].kb;
          catalog += prod.topics[ti].catalog;
        }
      }
    }
    return { kb: kb, catalog: catalog, products: products, topics: topics };
  };

  // ─── REGISTRY SEARCH ───────────────────────────────
  c.matchesRegistrySearch = function(company) {
    if (!c.search || c.search.length < 2) return true;
    var s = c.search.toLowerCase();
    if (company.name.toLowerCase().indexOf(s) > -1) return true;
    for (var i = 0; i < company.products.length; i++) {
      if (company.products[i].name.toLowerCase().indexOf(s) > -1) return true;
    }
    return false;
  };
}
