// SERVER SCRIPT - v6.3: Hide/unhide, confirm state feedback, analyze results filtering
(function() {
  var handled = false;

  if (input && input.action) {

    // ═══════ LOAD SUPPLY RESULTS ════════════════════════
    if (input.action === 'loadSupplyResults') {
      handled = true;
      data.supplyData = buildCompanyHierarchy('', ['kb_knowledge', 'sc_cat_item']);
    }

    // ═══════ LOAD GAPS / ANALYZE RESULTS ════════════════
    if (input.action === 'loadGaps') {
      handled = true;
      data.gapData = buildCompanyHierarchy('', ['kb_knowledge', 'sc_cat_item', 'incident']);
      data.gapData.companies = computeGaps(data.gapData.companies);
      // Filter: remove Unassigned, remove companies with 0 incidents in gaps view
      var filtered = [];
      for (var fc = 0; fc < data.gapData.companies.length; fc++) {
        var co = data.gapData.companies[fc];
        if (co.name === 'Unassigned') continue; // Hide unassigned entirely
        // Only show companies that have at least some data
        if (co.totalIncidents > 0 || co.totalKB > 0 || co.totalCatalog > 0) {
          filtered.push(co);
        }
      }
      data.gapData.companies = filtered;
    }

    // ═══════ LOAD REPORTS LIST ════════════════════════
    if (input.action === 'loadReports') {
      handled = true;
      data.reports = getReports();
    }

    // ═══════ LOAD REGISTRY ════════════════════════════
    if (input.action === 'loadRegistry') {
      handled = true;
      data.registry = getRegistry(false); // exclude hidden
    }

    // ═══════ SAVE COVERAGE RULE ═══════════════════════
    if (input.action === 'saveCoverageRule') {
      handled = true;
      var existing = new GlideRecord('u_x_snc_sd_coverage_rule');
      existing.addQuery('u_service_opportunity', input.topicSysId);
      existing.addQuery('u_product', input.productSysId);
      existing.query();
      if (existing.next()) {
        existing.setValue('u_required_coverage', input.rule);
        existing.setValue('u_overridden_by', gs.getUserID());
        existing.setValue('u_overridden_on', new GlideDateTime());
        existing.update();
      } else {
        var newRule = new GlideRecord('u_x_snc_sd_coverage_rule');
        newRule.initialize();
        newRule.setValue('u_service_opportunity', input.topicSysId);
        newRule.setValue('u_product', input.productSysId);
        newRule.setValue('u_required_coverage', input.rule);
        newRule.setValue('u_overridden_by', gs.getUserID());
        newRule.setValue('u_overridden_on', new GlideDateTime());
        newRule.insert();
      }
      data.saved = true;
    }

    // ═══════ CONFIRM PRODUCT ══════════════════════════
    if (input.action === 'confirmProduct') {
      handled = true;
      var cpGr = new GlideRecord('u_x_snc_sd_company_product');
      if (cpGr.get(input.productSysId)) {
        cpGr.setValue('u_verified', true);
        cpGr.update();
      }
      data.registry = getRegistry(false);
    }

    // ═══════ CONFIRM ALL FOR COMPANY ══════════════════
    if (input.action === 'confirmAllForCompany') {
      handled = true;
      var caGr = new GlideRecord('u_x_snc_sd_company_product');
      caGr.addQuery('u_company_name', input.companyName);
      caGr.addQuery('u_verified', false);
      caGr.query();
      while (caGr.next()) {
        caGr.setValue('u_verified', true);
        caGr.update();
      }
      data.registry = getRegistry(false);
    }

    // ═══════ HIDE PRODUCT (soft delete) ═══════════════
    if (input.action === 'hideProduct') {
      handled = true;
      var hpGr = new GlideRecord('u_x_snc_sd_company_product');
      if (hpGr.get(input.productSysId)) {
        hpGr.setValue('u_active', false);
        hpGr.update();
      }
      data.registry = getRegistry(false);
    }

    // ═══════ UNHIDE PRODUCT ═══════════════════════════
    if (input.action === 'unhideProduct') {
      handled = true;
      var uhGr = new GlideRecord('u_x_snc_sd_company_product');
      if (uhGr.get(input.productSysId)) {
        uhGr.setValue('u_active', true);
        uhGr.update();
      }
      data.registry = getRegistry(true); // include hidden for this view
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
      data.registry = getRegistry(false);
    }

    // ═══════ LOAD UNMATCHED (as registry-style cards) ══
    if (input.action === 'loadUnmatched') {
      handled = true;
      data.unmatched = getUnmatchedGrouped();
    }
  }

  // ═══════ INITIAL PAGE LOAD ══════════════════════════
  if (!handled) {
    data.reports = getReports();
    data.registry = getRegistry(false);
    data.latestRun = data.reports.length > 0 ? data.reports[0] : null;
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

  function getRegistry(includeHidden) {
    var registry = [];
    var regGr = new GlideRecord('u_x_snc_sd_company_product');
    if (!includeHidden) {
      // u_active might not exist yet, so handle gracefully
      if (regGr.isValidField('u_active')) {
        regGr.addQuery('u_active', '!=', false);
      }
    }
    regGr.orderBy('u_company_name');
    regGr.orderBy('u_name');
    regGr.query();
    while (regGr.next()) {
      var isActive = true;
      if (regGr.isValidField('u_active')) {
        isActive = regGr.getValue('u_active') != 'false';
      }
      registry.push({
        sys_id: regGr.getUniqueValue(),
        name: regGr.getValue('u_name') || '',
        company: regGr.getValue('u_company_name') || '',
        verified: regGr.getValue('u_verified') == 'true',
        mentions: parseInt(regGr.getValue('u_mention_count')) || 0,
        hidden: !isActive
      });
    }

    var companies = {};
    for (var i = 0; i < registry.length; i++) {
      var co = registry[i].company || 'Other';
      // Skip entries where product = company (unidentified product)
      var isGeneral = registry[i].name === co;
      registry[i].isGeneral = isGeneral;

      if (!companies[co]) {
        companies[co] = { name: co, products: [], verified: true, totalMentions: 0 };
      }
      companies[co].products.push(registry[i]);
      companies[co].totalMentions += registry[i].mentions;
      if (!registry[i].verified) companies[co].verified = false;
    }

    var result = [];
    for (var key in companies) {
      result.push(companies[key]);
    }
    result.sort(function(a, b) { return b.totalMentions - a.totalMentions; });
    return result;
  }

  function getUnmatchedGrouped() {
    // Get unmatched classifications and group by extracted company/product
    var groups = {};
    var clsGr = new GlideRecord('u_x_snc_sd_classification');
    clsGr.addQuery('u_in_other_bucket', true);
    clsGr.addQuery('u_source_type', 'incident');
    clsGr.query();
    while (clsGr.next()) {
      var company = clsGr.getValue('u_extracted_company') || 'Unknown';
      var product = clsGr.getValue('u_extracted_product') || '';
      var key = company + '|' + product;
      if (!groups[key]) {
        groups[key] = {
          company: company,
          product: product,
          count: 0,
          incidents: []
        };
      }
      groups[key].count++;
      if (groups[key].incidents.length < 3) {
        groups[key].incidents.push({
          number: clsGr.getValue('u_source_number') || '',
          description: clsGr.getValue('u_source_description') || ''
        });
      }
    }

    // Convert to array grouped by company
    var companyGroups = {};
    for (var gk in groups) {
      var g = groups[gk];
      if (!companyGroups[g.company]) {
        companyGroups[g.company] = { name: g.company, products: [] };
      }
      companyGroups[g.company].products.push({
        name: g.product || '(Unidentified product)',
        count: g.count,
        incidents: g.incidents
      });
    }

    var result = [];
    for (var ck in companyGroups) {
      result.push(companyGroups[ck]);
    }
    result.sort(function(a, b) {
      var aCount = a.products.reduce(function(s, p) { return s + p.count; }, 0);
      var bCount = b.products.reduce(function(s, p) { return s + p.count; }, 0);
      return bCount - aCount;
    });
    return result;
  }

  function buildCompanyHierarchy(runId, sourceTypes) {
    var productLookup = {};
    var plGr = new GlideRecord('u_x_snc_sd_company_product');
    if (plGr.isValidField('u_active')) {
      plGr.addQuery('u_active', '!=', false);
    }
    plGr.query();
    while (plGr.next()) {
      productLookup[plGr.getUniqueValue()] = {
        name: plGr.getValue('u_name') || '',
        company: plGr.getValue('u_company_name') || '',
        sys_id: plGr.getUniqueValue()
      };
    }

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

    var ruleOverrides = {};
    var ruleGr = new GlideRecord('u_x_snc_sd_coverage_rule');
    ruleGr.query();
    while (ruleGr.next()) {
      var ruleKey = ruleGr.getValue('u_service_opportunity') + '|' + ruleGr.getValue('u_product');
      ruleOverrides[ruleKey] = ruleGr.getValue('u_required_coverage') || '';
    }

    var clsGr = new GlideRecord('u_x_snc_sd_classification');
    if (runId) clsGr.addQuery('u_analysis_run', runId);
    if (sourceTypes && sourceTypes.length > 0) clsGr.addQuery('u_source_type', 'IN', sourceTypes.join(','));
    clsGr.query();

    var tree = {};
    while (clsGr.next()) {
      var prodRef = clsGr.getValue('u_product') || '';
      var topicRef = clsGr.getValue('u_service_opportunity') || '';
      var srcType = clsGr.getValue('u_source_type') || '';

      var prodInfo = productLookup[prodRef];
      if (!prodInfo) {
        // No product match — put under Unassigned
        prodInfo = { name: 'Unassigned', company: 'Unassigned', sys_id: '' };
      }

      var topicInfo = topicLookup[topicRef] || { name: 'Unclassified', parent: 'Other', solution: '', sys_id: '' };

      var companyName = prodInfo.company || 'Unassigned';
      var productName = prodInfo.name || 'Unassigned';

      // Rename company=product to "(General)"
      if (productName === companyName && companyName !== 'Unassigned') {
        productName = '(General)';
      }

      if (!tree[companyName]) tree[companyName] = { name: companyName, products: {} };
      if (!tree[companyName].products[productName]) {
        tree[companyName].products[productName] = { name: productName, sys_id: prodInfo.sys_id, topics: {} };
      }

      var topicKey = topicRef || topicInfo.name;
      if (!tree[companyName].products[productName].topics[topicKey]) {
        var defaultRule = deriveDefaultRule(topicInfo.solution);
        var overrideKey = topicRef + '|' + prodInfo.sys_id;
        var rule = ruleOverrides[overrideKey] || defaultRule;
        tree[companyName].products[productName].topics[topicKey] = {
          name: topicInfo.name, parent: topicInfo.parent, sys_id: topicRef,
          product_sys_id: prodInfo.sys_id, rule: rule,
          kb: 0, catalog: 0, incidents: 0, records: []
        };
      }

      var topicNode = tree[companyName].products[productName].topics[topicKey];
      if (srcType === 'kb_knowledge') topicNode.kb++;
      else if (srcType === 'sc_cat_item') topicNode.catalog++;
      else if (srcType === 'incident') topicNode.incidents++;

      if (topicNode.records.length < 5) {
        topicNode.records.push({ type: srcType, number: clsGr.getValue('u_source_number') || '', description: clsGr.getValue('u_source_description') || '' });
      }
    }

    var companies = [];
    for (var ck in tree) {
      var products = [];
      for (var pk in tree[ck].products) {
        var topics = [];
        for (var tk in tree[ck].products[pk].topics) topics.push(tree[ck].products[pk].topics[tk]);
        topics.sort(function(a, b) { return (b.incidents + b.kb + b.catalog) - (a.incidents + a.kb + a.catalog); });
        products.push({
          name: tree[ck].products[pk].name, sys_id: tree[ck].products[pk].sys_id, topics: topics,
          totalKB: topics.reduce(function(s, t) { return s + t.kb; }, 0),
          totalCatalog: topics.reduce(function(s, t) { return s + t.catalog; }, 0),
          totalIncidents: topics.reduce(function(s, t) { return s + t.incidents; }, 0)
        });
      }
      products.sort(function(a, b) { return (b.totalIncidents + b.totalKB + b.totalCatalog) - (a.totalIncidents + a.totalKB + a.totalCatalog); });
      companies.push({
        name: tree[ck].name, products: products,
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
    if (sol.indexOf('kb') > -1 && sol.indexOf('catalog') > -1) return 'both';
    if (sol.indexOf('kb') > -1) return 'kb';
    if (sol.indexOf('catalog') > -1) return 'catalog';
    return 'either';
  }

  function computeGaps(companies) {
    for (var c = 0; c < companies.length; c++) {
      var compGaps = 0;
      for (var p = 0; p < companies[c].products.length; p++) {
        var prodGaps = 0;
        for (var t = 0; t < companies[c].products[p].topics.length; t++) {
          var topic = companies[c].products[p].topics[t];
          if (topic.incidents === 0) { topic.gapStatus = 'no-demand'; topic.gaps = []; topic.covered = true; continue; }
          var rule = topic.rule || 'either';
          var gaps = [];
          if (rule === 'kb' && topic.kb === 0) gaps.push('KB article');
          if (rule === 'catalog' && topic.catalog === 0) gaps.push('Catalog item');
          if (rule === 'both') { if (topic.kb === 0) gaps.push('KB article'); if (topic.catalog === 0) gaps.push('Catalog item'); }
          if (rule === 'either' && topic.kb === 0 && topic.catalog === 0) gaps.push('Content');
          if (rule === 'none') gaps = [];
          topic.covered = gaps.length === 0;
          topic.gaps = gaps;
          topic.gapStatus = gaps.length > 0 ? 'gap' : 'covered';
          if (!topic.covered) { prodGaps++; compGaps++; }
        }
        companies[c].products[p].gapCount = prodGaps;
      }
      companies[c].gapCount = compGaps;
    }
    return companies;
  }

})();
