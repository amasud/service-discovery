// SERVER SCRIPT - v6: Company → Product → Topic hierarchy
// Supports: home, supply results, registry, demand config, gaps view, reports list

(function() {
  var handled = false;

  if (input && input.action) {

    // ═══════ LOAD SUPPLY RESULTS ═══════════════════════
    if (input.action === 'loadSupplyResults') {
      handled = true;
      var runId = input.runSysId || '';
      data.supplyData = buildCompanyHierarchy(runId, ['kb_knowledge', 'sc_cat_item']);
    }

    // ═══════ LOAD GAP ANALYSIS ════════════════════════
    if (input.action === 'loadGaps') {
      handled = true;
      var runId = input.runSysId || '';
      data.gapData = buildCompanyHierarchy(runId, ['kb_knowledge', 'sc_cat_item', 'incident']);
      data.gapData.companies = computeGaps(data.gapData.companies);
    }

    // ═══════ LOAD REPORTS LIST ════════════════════════
    if (input.action === 'loadReports') {
      handled = true;
      data.reports = getReports();
    }

    // ═══════ LOAD REGISTRY ════════════════════════════
    if (input.action === 'loadRegistry') {
      handled = true;
      data.registry = getRegistry();
    }

    // ═══════ SAVE COVERAGE RULE ═══════════════════════
    if (input.action === 'saveCoverageRule') {
      handled = true;
      var topicSysId = input.topicSysId;
      var productSysId = input.productSysId;
      var rule = input.rule;

      // Check if override exists
      var existing = new GlideRecord('u_x_snc_sd_coverage_rule');
      existing.addQuery('u_service_opportunity', topicSysId);
      existing.addQuery('u_product', productSysId);
      existing.query();

      if (existing.next()) {
        existing.setValue('u_required_coverage', rule);
        existing.setValue('u_overridden_by', gs.getUserID());
        existing.setValue('u_overridden_on', new GlideDateTime());
        existing.update();
      } else {
        var newRule = new GlideRecord('u_x_snc_sd_coverage_rule');
        newRule.initialize();
        newRule.setValue('u_service_opportunity', topicSysId);
        newRule.setValue('u_product', productSysId);
        newRule.setValue('u_required_coverage', rule);
        newRule.setValue('u_overridden_by', gs.getUserID());
        newRule.setValue('u_overridden_on', new GlideDateTime());
        newRule.insert();
      }
      data.saved = true;
    }

    // ═══════ CONFIRM PRODUCT ══════════════════════════
    if (input.action === 'confirmProduct') {
      handled = true;
      var prodGr = new GlideRecord('u_x_snc_sd_company_product');
      if (prodGr.get(input.productSysId)) {
        prodGr.setValue('u_verified', true);
        prodGr.update();
      }
      data.confirmed = true;
    }

    // ═══════ REMOVE PRODUCT ═══════════════════════════
    if (input.action === 'removeProduct') {
      handled = true;
      var prodGr = new GlideRecord('u_x_snc_sd_company_product');
      if (prodGr.get(input.productSysId)) {
        prodGr.deleteRecord();
      }
      data.removed = true;
    }

    // ═══════ ADD COMPANY/PRODUCT ══════════════════════
    if (input.action === 'addProduct') {
      handled = true;
      var newProd = new GlideRecord('u_x_snc_sd_company_product');
      newProd.initialize();
      newProd.setValue('u_name', input.productName || '');
      newProd.setValue('u_company_name', input.companyName || '');
      newProd.setValue('u_normalized_name', (input.productName || '').toLowerCase());
      newProd.setValue('u_verified', true);
      newProd.setValue('u_mention_count', 0);
      newProd.insert();
      data.added = true;
    }
  }

  // ═══════ INITIAL PAGE LOAD ══════════════════════════
  if (!handled) {
    data.reports = getReports();
    data.registry = getRegistry();

    // Summary stats from latest complete run
    var latestRun = null;
    if (data.reports.length > 0) {
      latestRun = data.reports[0];
    }
    data.latestRun = latestRun;
  }

  // ═══════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════

  function getReports() {
    var reports = [];
    var runGr = new GlideRecord('u_x_snc_sd_analysis_run');
    runGr.orderByDesc('u_run_date');
    runGr.setLimit(20);
    runGr.query();
    while (runGr.next()) {
      reports.push({
        sys_id: runGr.getUniqueValue(),
        name: runGr.getValue('u_name') || '',
        date: runGr.getDisplayValue('u_run_date') || '',
        status: runGr.getValue('u_status') || '',
        totalAnalyzed: parseInt(runGr.getValue('u_total_incidents_analyzed')) || 0,
        unmatched: parseInt(runGr.getValue('u_items_in_other_bucket')) || 0
      });
    }
    return reports;
  }

  function getRegistry() {
    var registry = [];
    var regGr = new GlideRecord('u_x_snc_sd_company_product');
    regGr.orderBy('u_company_name');
    regGr.orderBy('u_name');
    regGr.query();
    while (regGr.next()) {
      registry.push({
        sys_id: regGr.getUniqueValue(),
        name: regGr.getValue('u_name') || '',
        company: regGr.getValue('u_company_name') || '',
        verified: regGr.getValue('u_verified') == 'true',
        mentions: parseInt(regGr.getValue('u_mention_count')) || 0
      });
    }

    // Group by company
    var companies = {};
    for (var i = 0; i < registry.length; i++) {
      var co = registry[i].company || 'Other';
      if (!companies[co]) {
        companies[co] = { name: co, products: [], verified: false };
      }
      companies[co].products.push(registry[i]);
      if (registry[i].verified) companies[co].verified = true;
    }

    var result = [];
    for (var key in companies) {
      result.push(companies[key]);
    }
    result.sort(function(a, b) {
      return b.products.length - a.products.length;
    });
    return result;
  }

  function buildCompanyHierarchy(runId, sourceTypes) {
    // Build product lookup
    var productLookup = {};
    var plGr = new GlideRecord('u_x_snc_sd_company_product');
    plGr.query();
    while (plGr.next()) {
      productLookup[plGr.getUniqueValue()] = {
        name: plGr.getValue('u_name') || '',
        company: plGr.getValue('u_company_name') || '',
        sys_id: plGr.getUniqueValue()
      };
    }

    // Build topic lookup
    var topicLookup = {};
    var topicGr = new GlideRecord('u_x_snc_sd_opportunity');
    topicGr.addQuery('u_active', true);
    topicGr.addNotNullQuery('u_parent_category');
    topicGr.query();
    while (topicGr.next()) {
      topicLookup[topicGr.getUniqueValue()] = {
        name: topicGr.getValue('u_name') || '',
        parent: topicGr.getValue('u_parent_category') || '',
        solution: topicGr.getValue('u_solution_type') || '',
        sys_id: topicGr.getUniqueValue()
      };
    }

    // Build coverage rule overrides lookup
    var ruleOverrides = {};
    var ruleGr = new GlideRecord('u_x_snc_sd_coverage_rule');
    ruleGr.query();
    while (ruleGr.next()) {
      var ruleKey = ruleGr.getValue('u_service_opportunity') + '|' + ruleGr.getValue('u_product');
      ruleOverrides[ruleKey] = ruleGr.getValue('u_required_coverage') || '';
    }

    // Query classifications
    var clsGr = new GlideRecord('u_x_snc_sd_classification');
    if (runId) {
      clsGr.addQuery('u_analysis_run', runId);
    }
    if (sourceTypes && sourceTypes.length > 0) {
      clsGr.addQuery('u_source_type', 'IN', sourceTypes.join(','));
    }
    clsGr.query();

    // Build: company → product → topic → counts
    var tree = {};

    while (clsGr.next()) {
      var prodRef = clsGr.getValue('u_product') || '';
      var topicRef = clsGr.getValue('u_service_opportunity') || '';
      var srcType = clsGr.getValue('u_source_type') || '';

      var prodInfo = productLookup[prodRef] || { name: 'Unassigned', company: 'Unassigned', sys_id: '' };
      var topicInfo = topicLookup[topicRef] || { name: 'Unclassified', parent: 'Other', solution: '', sys_id: '' };

      var companyName = prodInfo.company || 'Unassigned';
      var productName = prodInfo.name || 'Unassigned';
      var topicName = topicInfo.name;
      var parentCat = topicInfo.parent;

      // Initialize tree nodes
      if (!tree[companyName]) {
        tree[companyName] = { name: companyName, products: {} };
      }
      if (!tree[companyName].products[productName]) {
        tree[companyName].products[productName] = {
          name: productName,
          sys_id: prodInfo.sys_id,
          topics: {}
        };
      }
      var topicKey = topicRef || topicName;
      if (!tree[companyName].products[productName].topics[topicKey]) {
        // Determine coverage rule
        var defaultRule = deriveDefaultRule(topicInfo.solution);
        var overrideKey = topicRef + '|' + prodInfo.sys_id;
        var rule = ruleOverrides[overrideKey] || defaultRule;

        tree[companyName].products[productName].topics[topicKey] = {
          name: topicName,
          parent: parentCat,
          sys_id: topicRef,
          product_sys_id: prodInfo.sys_id,
          rule: rule,
          kb: 0,
          catalog: 0,
          incidents: 0,
          records: []
        };
      }

      var topicNode = tree[companyName].products[productName].topics[topicKey];

      // Count by source type
      if (srcType === 'kb_knowledge') topicNode.kb++;
      else if (srcType === 'sc_cat_item') topicNode.catalog++;
      else if (srcType === 'incident') topicNode.incidents++;

      // Store sample records (max 5 per topic)
      if (topicNode.records.length < 5) {
        topicNode.records.push({
          type: srcType,
          number: clsGr.getValue('u_source_number') || '',
          description: clsGr.getValue('u_source_description') || '',
          close_notes: clsGr.getValue('u_close_notes') || ''
        });
      }
    }

    // Convert to arrays and sort
    var companies = [];
    for (var ck in tree) {
      var companyNode = tree[ck];
      var products = [];
      for (var pk in companyNode.products) {
        var prodNode = companyNode.products[pk];
        var topics = [];
        for (var tk in prodNode.topics) {
          topics.push(prodNode.topics[tk]);
        }
        topics.sort(function(a, b) { return (b.incidents + b.kb + b.catalog) - (a.incidents + a.kb + a.catalog); });
        products.push({
          name: prodNode.name,
          sys_id: prodNode.sys_id,
          topics: topics,
          totalKB: topics.reduce(function(s, t) { return s + t.kb; }, 0),
          totalCatalog: topics.reduce(function(s, t) { return s + t.catalog; }, 0),
          totalIncidents: topics.reduce(function(s, t) { return s + t.incidents; }, 0)
        });
      }
      products.sort(function(a, b) { return (b.totalIncidents + b.totalKB + b.totalCatalog) - (a.totalIncidents + a.totalKB + a.totalCatalog); });
      companies.push({
        name: companyNode.name,
        products: products,
        totalKB: products.reduce(function(s, p) { return s + p.totalKB; }, 0),
        totalCatalog: products.reduce(function(s, p) { return s + p.totalCatalog; }, 0),
        totalIncidents: products.reduce(function(s, p) { return s + p.totalIncidents; }, 0)
      });
    }
    companies.sort(function(a, b) { return (b.totalIncidents + b.totalKB + b.totalCatalog) - (a.totalIncidents + a.totalKB + a.totalCatalog); });

    return { companies: companies };
  }

  function deriveDefaultRule(solutionType) {
    if (!solutionType) return 'either';
    var sol = solutionType.toLowerCase();
    var hasKB = sol.indexOf('kb') > -1;
    var hasCat = sol.indexOf('catalog') > -1;
    if (hasKB && hasCat) return 'both';
    if (hasKB) return 'kb';
    if (hasCat) return 'catalog';
    return 'either';
  }

  function computeGaps(companies) {
    for (var c = 0; c < companies.length; c++) {
      var compGaps = 0;
      for (var p = 0; p < companies[c].products.length; p++) {
        var prodGaps = 0;
        for (var t = 0; t < companies[c].products[p].topics.length; t++) {
          var topic = companies[c].products[p].topics[t];
          if (topic.incidents === 0) {
            topic.gapStatus = 'no-demand';
            topic.gaps = [];
            topic.covered = true;
            continue;
          }
          var rule = topic.rule || 'either';
          var gaps = [];
          if (rule === 'kb' && topic.kb === 0) gaps.push('KB article');
          if (rule === 'catalog' && topic.catalog === 0) gaps.push('Catalog item');
          if (rule === 'both') {
            if (topic.kb === 0) gaps.push('KB article');
            if (topic.catalog === 0) gaps.push('Catalog item');
          }
          if (rule === 'either' && topic.kb === 0 && topic.catalog === 0) gaps.push('Content');
          if (rule === 'none') gaps = [];

          topic.covered = gaps.length === 0;
          topic.gaps = gaps;
          topic.gapStatus = gaps.length > 0 ? 'gap' : 'covered';
          if (!topic.covered) {
            prodGaps++;
            compGaps++;
          }
        }
        companies[c].products[p].gapCount = prodGaps;
      }
      companies[c].gapCount = compGaps;
    }
    return companies;
  }

})();
