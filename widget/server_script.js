// SERVER SCRIPT - v6.4: Case-insensitive source_type, performance, confirm fix, unhide
(function() {
  var handled = false;

  if (input && input.action) {

    if (input.action === 'loadSupplyResults') {
      handled = true;
      data.supplyData = buildCompanyHierarchy(['kb_knowledge', 'sc_cat_item']);
    }

    if (input.action === 'loadGaps') {
      handled = true;
      data.gapData = buildCompanyHierarchy(['kb_knowledge', 'sc_cat_item', 'incident']);
      data.gapData.companies = computeGaps(data.gapData.companies);
      // Filter out Unassigned and empty companies
      var filtered = [];
      for (var i = 0; i < data.gapData.companies.length; i++) {
        var co = data.gapData.companies[i];
        if (co.name === 'Unassigned') continue;
        if (co.totalIncidents > 0 || co.totalKB > 0 || co.totalCatalog > 0) filtered.push(co);
      }
      data.gapData.companies = filtered;
    }

    if (input.action === 'loadReports') {
      handled = true;
      data.reports = getReports();
    }

    if (input.action === 'loadRegistry') {
      handled = true;
      var includeHidden = input.includeHidden === 'true';
      data.registry = getRegistry(includeHidden);
    }

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
        var nr = new GlideRecord('u_x_snc_sd_coverage_rule');
        nr.initialize();
        nr.setValue('u_service_opportunity', input.topicSysId);
        nr.setValue('u_product', input.productSysId);
        nr.setValue('u_required_coverage', input.rule);
        nr.setValue('u_overridden_by', gs.getUserID());
        nr.setValue('u_overridden_on', new GlideDateTime());
        nr.insert();
      }
      data.saved = true;
    }

    if (input.action === 'confirmProduct') {
      handled = true;
      var cpGr = new GlideRecord('u_x_snc_sd_company_product');
      if (cpGr.get(input.productSysId)) {
        cpGr.setValue('u_verified', true);
        cpGr.update();
      }
      data.registry = getRegistry(false);
    }

    if (input.action === 'confirmAllForCompany') {
      handled = true;
      var caGr = new GlideRecord('u_x_snc_sd_company_product');
      caGr.addQuery('u_company_name', input.companyName || '');
      caGr.addQuery('u_verified', false);
      caGr.query();
      var count = 0;
      while (caGr.next()) {
        caGr.setValue('u_verified', true);
        caGr.update();
        count++;
      }
      gs.info('SD: Confirmed ' + count + ' products for ' + input.companyName);
      data.registry = getRegistry(false);
    }

    if (input.action === 'hideProduct') {
      handled = true;
      var hGr = new GlideRecord('u_x_snc_sd_company_product');
      if (hGr.get(input.productSysId)) {
        if (hGr.isValidField('u_active')) {
          hGr.setValue('u_active', false);
        }
        hGr.update();
      }
      data.registry = getRegistry(false);
    }

    if (input.action === 'unhideProduct') {
      handled = true;
      var uGr = new GlideRecord('u_x_snc_sd_company_product');
      if (uGr.get(input.productSysId)) {
        if (uGr.isValidField('u_active')) {
          uGr.setValue('u_active', true);
        }
        uGr.update();
      }
      data.registry = getRegistry(true);
    }

    if (input.action === 'addProduct') {
      handled = true;
      var np = new GlideRecord('u_x_snc_sd_company_product');
      np.initialize();
      np.setValue('u_name', input.productName || '');
      np.setValue('u_company_name', input.companyName || '');
      np.setValue('u_normalized_name', (input.productName || '').toLowerCase());
      np.setValue('u_verified', true);
      np.setValue('u_mention_count', 0);
      np.insert();
      data.registry = getRegistry(false);
    }

    if (input.action === 'loadUnmatched') {
      handled = true;
      data.unmatched = getUnmatchedGrouped();
    }
  }

  if (!handled) {
    data.reports = getReports();
    data.registry = getRegistry(false);
  }

  // ═══════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════

  function getReports() {
    var reports = [];
    var gr = new GlideRecord('u_x_snc_sd_analysis_run');
    gr.orderByDesc('u_run_date');
    gr.setLimit(20);
    gr.query();
    while (gr.next()) {
      reports.push({
        sys_id: gr.getUniqueValue(),
        name: gr.getValue('u_name') || '',
        date: gr.getDisplayValue('u_run_date') || '',
        status: gr.getValue('u_status') || '',
        totalAnalyzed: parseInt(gr.getValue('u_total_incidents_analyzed')) || 0,
        unmatched: parseInt(gr.getValue('u_items_in_other_bucket')) || 0
      });
    }
    return reports;
  }

  function getRegistry(includeHidden) {
    var items = [];
    var gr = new GlideRecord('u_x_snc_sd_company_product');
    var hasActive = gr.isValidField('u_active');
    if (!includeHidden && hasActive) {
      gr.addQuery('u_active', '!=', false);
    }
    gr.orderBy('u_company_name');
    gr.orderBy('u_name');
    gr.query();
    while (gr.next()) {
      var isActive = true;
      if (hasActive) isActive = gr.getValue('u_active') != 'false';
      var name = gr.getValue('u_name') || '';
      var company = gr.getValue('u_company_name') || '';
      items.push({
        sys_id: gr.getUniqueValue(),
        name: name,
        displayName: (name === company) ? '(General)' : name,
        company: company,
        verified: gr.getValue('u_verified') == 'true',
        mentions: parseInt(gr.getValue('u_mention_count')) || 0,
        hidden: !isActive
      });
    }

    var companies = {};
    for (var i = 0; i < items.length; i++) {
      var co = items[i].company || 'Other';
      if (!companies[co]) companies[co] = { name: co, products: [], verified: true, totalMentions: 0 };
      companies[co].products.push(items[i]);
      companies[co].totalMentions += items[i].mentions;
      if (!items[i].verified) companies[co].verified = false;
    }

    var result = [];
    for (var k in companies) result.push(companies[k]);
    result.sort(function(a, b) { return b.totalMentions - a.totalMentions; });
    return result;
  }

  function getUnmatchedGrouped() {
    var groups = {};
    var gr = new GlideRecord('u_x_snc_sd_classification');
    gr.addQuery('u_in_other_bucket', true);
    gr.query();
    while (gr.next()) {
      var company = gr.getValue('u_extracted_company') || 'Unknown';
      var product = gr.getValue('u_extracted_product') || '';
      var key = company + '|' + product;
      if (!groups[key]) groups[key] = { company: company, product: product, count: 0 };
      groups[key].count++;
    }

    var companyGroups = {};
    for (var gk in groups) {
      var g = groups[gk];
      if (!companyGroups[g.company]) companyGroups[g.company] = { name: g.company, products: [] };
      companyGroups[g.company].products.push({
        name: g.product || '(Unidentified product)',
        count: g.count
      });
    }

    var result = [];
    for (var ck in companyGroups) result.push(companyGroups[ck]);
    result.sort(function(a, b) {
      return b.products.reduce(function(s, p) { return s + p.count; }, 0) - a.products.reduce(function(s, p) { return s + p.count; }, 0);
    });
    return result;
  }

  function normalizeSourceType(srcType) {
    if (!srcType) return '';
    var lower = srcType.toLowerCase();
    if (lower === 'incident') return 'incident';
    if (lower === 'kb_knowledge') return 'kb_knowledge';
    if (lower === 'sc_cat_item') return 'sc_cat_item';
    return lower;
  }

  function buildCompanyHierarchy(sourceTypes) {
    var productLookup = {};
    var plGr = new GlideRecord('u_x_snc_sd_company_product');
    var hasActive = plGr.isValidField('u_active');
    if (hasActive) plGr.addQuery('u_active', '!=', false);
    plGr.query();
    while (plGr.next()) {
      productLookup[plGr.getUniqueValue()] = {
        name: plGr.getValue('u_name') || '',
        company: plGr.getValue('u_company_name') || '',
        sys_id: plGr.getUniqueValue()
      };
    }

    var topicLookup = {};
    var tGr = new GlideRecord('u_x_snc_sd_opportunity');
    tGr.addQuery('u_active', true);
    tGr.addNotNullQuery('u_parent_category');
    tGr.query();
    while (tGr.next()) {
      topicLookup[tGr.getUniqueValue()] = {
        name: tGr.getValue('u_name') || '',
        parent: tGr.getValue('u_parent_category') || '',
        solution: tGr.getValue('u_solution_type') || '',
        sys_id: tGr.getUniqueValue()
      };
    }

    var ruleOverrides = {};
    var rGr = new GlideRecord('u_x_snc_sd_coverage_rule');
    rGr.query();
    while (rGr.next()) {
      ruleOverrides[rGr.getValue('u_service_opportunity') + '|' + rGr.getValue('u_product')] = rGr.getValue('u_required_coverage') || '';
    }

    // Query classifications — no run filter, combine all
    var clsGr = new GlideRecord('u_x_snc_sd_classification');
    // Don't filter by source_type in query — normalize in code to handle case issues
    clsGr.addNotNullQuery('u_service_opportunity');
    clsGr.query();

    var tree = {};
    var sourceTypeSet = {};
    for (var st = 0; st < sourceTypes.length; st++) sourceTypeSet[sourceTypes[st]] = true;

    while (clsGr.next()) {
      var rawSrcType = clsGr.getValue('u_source_type') || '';
      var srcType = normalizeSourceType(rawSrcType);

      // Filter to requested source types
      if (!sourceTypeSet[srcType]) continue;

      var prodRef = clsGr.getValue('u_product') || '';
      var topicRef = clsGr.getValue('u_service_opportunity') || '';

      var prodInfo = productLookup[prodRef] || { name: 'Unassigned', company: 'Unassigned', sys_id: '' };
      var topicInfo = topicLookup[topicRef] || { name: 'Unclassified', parent: 'Other', solution: '', sys_id: '' };

      var companyName = prodInfo.company || 'Unassigned';
      var productName = prodInfo.name || 'Unassigned';
      if (productName === companyName && companyName !== 'Unassigned') productName = '(General)';

      if (!tree[companyName]) tree[companyName] = { name: companyName, products: {} };
      if (!tree[companyName].products[productName]) tree[companyName].products[productName] = { name: productName, sys_id: prodInfo.sys_id, topics: {} };

      var topicKey = topicRef || topicInfo.name;
      if (!tree[companyName].products[productName].topics[topicKey]) {
        var defaultRule = deriveDefaultRule(topicInfo.solution);
        var overrideKey = topicRef + '|' + prodInfo.sys_id;
        tree[companyName].products[productName].topics[topicKey] = {
          name: topicInfo.name, parent: topicInfo.parent, sys_id: topicRef,
          product_sys_id: prodInfo.sys_id, rule: ruleOverrides[overrideKey] || defaultRule,
          kb: 0, catalog: 0, incidents: 0
        };
      }

      var node = tree[companyName].products[productName].topics[topicKey];
      if (srcType === 'kb_knowledge') node.kb++;
      else if (srcType === 'sc_cat_item') node.catalog++;
      else if (srcType === 'incident') node.incidents++;
    }

    // Convert to sorted arrays
    var companies = [];
    for (var ck in tree) {
      var products = [];
      for (var pk in tree[ck].products) {
        var topics = [];
        for (var tk in tree[ck].products[pk].topics) topics.push(tree[ck].products[pk].topics[tk]);
        topics.sort(function(a, b) { return (b.incidents + b.kb + b.catalog) - (a.incidents + a.kb + a.catalog); });
        var totalKB = 0, totalCat = 0, totalInc = 0;
        for (var ti = 0; ti < topics.length; ti++) { totalKB += topics[ti].kb; totalCat += topics[ti].catalog; totalInc += topics[ti].incidents; }
        products.push({ name: tree[ck].products[pk].name, sys_id: tree[ck].products[pk].sys_id, topics: topics, totalKB: totalKB, totalCatalog: totalCat, totalIncidents: totalInc });
      }
      products.sort(function(a, b) { return (b.totalIncidents + b.totalKB + b.totalCatalog) - (a.totalIncidents + a.totalKB + a.totalCatalog); });
      var coKB = 0, coCat = 0, coInc = 0;
      for (var pi = 0; pi < products.length; pi++) { coKB += products[pi].totalKB; coCat += products[pi].totalCatalog; coInc += products[pi].totalIncidents; }
      companies.push({ name: tree[ck].name, products: products, totalKB: coKB, totalCatalog: coCat, totalIncidents: coInc });
    }
    companies.sort(function(a, b) { return (b.totalIncidents + b.totalKB + b.totalCatalog) - (a.totalIncidents + a.totalKB + a.totalCatalog); });
    return { companies: companies };
  }

  function deriveDefaultRule(sol) {
    if (!sol) return 'either';
    sol = sol.toLowerCase();
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
          if (topic.incidents === 0) { topic.gaps = []; topic.covered = true; continue; }
          var rule = topic.rule || 'either';
          var gaps = [];
          if (rule === 'kb' && topic.kb === 0) gaps.push('KB article');
          if (rule === 'catalog' && topic.catalog === 0) gaps.push('Catalog item');
          if (rule === 'both') { if (topic.kb === 0) gaps.push('KB article'); if (topic.catalog === 0) gaps.push('Catalog item'); }
          if (rule === 'either' && topic.kb === 0 && topic.catalog === 0) gaps.push('Content');
          if (rule === 'none') gaps = [];
          topic.covered = gaps.length === 0;
          topic.gaps = gaps;
          if (!topic.covered) { prodGaps++; compGaps++; }
        }
        companies[c].products[p].gapCount = prodGaps;
      }
      companies[c].gapCount = compGaps;
    }
    return companies;
  }

})();
