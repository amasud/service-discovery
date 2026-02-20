// SERVER SCRIPT - v6.4: Case-insensitive source_type, performance, confirm fix, unhide
(function() {
  var handled = false;

  if (input && input.action) {
    var action = input.action;
  } else if (data && data.action) {
    var action = data.action;
    // Copy data fields to input-like object for compatibility
    input = input || {};
    input.action = data.action;
    input.productSysId = data.productSysId || '';
    input.companyName = data.companyName || '';
    input.productName = data.productName || '';
    input.topicSysId = data.topicSysId || '';
    input.rule = data.rule || '';
    input.includeHidden = data.includeHidden || '';
    input.reportName = data.reportName || '';
    input.kbState = data.kbState || '';
    input.limit = data.limit || '';
    input.dateFrom = data.dateFrom || '';
    input.dateTo = data.dateTo || '';
  }

  if (input && input.action) {

    if (input.action === 'loadSupplyResults') {
      handled = true;
      data.supplyData = buildCompanyHierarchy(['kb_knowledge', 'sc_cat_item']);
      // Rename Unassigned, keep visible if has data
      var sf = [];
      for (var si = 0; si < data.supplyData.companies.length; si++) {
        var sco = data.supplyData.companies[si];
        if (sco.name === 'Unassigned') {
          sco.name = '(No product identified)';
          for (var sp = 0; sp < sco.products.length; sp++) {
            if (sco.products[sp].name === 'Unassigned') sco.products[sp].name = '(General)';
          }
        }
        if (sco.totalKB > 0 || sco.totalCatalog > 0) sf.push(sco);
      }
      data.supplyData.companies = sf;
    }

    // ═══════ RUN SUPPLY ANALYSIS (invokes NASK) ═════════
    if (input.action === 'runSupplyAnalysis') {
      handled = true;
      var SUPPLY_SKILL = '2d09b3ce2f4bfa90308dfb3fafa4e3d9';
      var kbState = input.kbState || 'published';
      var limit = parseInt(input.limit) || 10;
      var reportName = input.reportName || 'Supply Analysis - ' + new GlideDateTime().getDisplayValue();

      // Create run
      var runGr = new GlideRecord('u_x_snc_sd_analysis_run');
      runGr.initialize();
      runGr.setValue('u_name', reportName);
      runGr.setValue('u_status', 'Processing');
      runGr.setValue('u_run_date', new GlideDateTime());
      var runSysId = runGr.insert();

      var totalProcessed = 0;
      var totalClassified = 0;

      // Process KB articles
      var kbGr = new GlideRecord('kb_knowledge');
      if (kbState) kbGr.addQuery('workflow_state', kbState);
      kbGr.setLimit(limit);
      kbGr.orderByDesc('sys_updated_on');
      kbGr.query();
      while (kbGr.next()) {
        var kbSysId = kbGr.getUniqueValue();
        // Skip if already classified
        if (alreadyClassified(kbSysId)) continue;
        totalProcessed++;
        var kbTitle = kbGr.getValue('short_description') || '';
        var kbText = (kbGr.getValue('text') || '').replace(/<[^>]*>/g, '').substring(0, 3000);
        var kbNumber = kbGr.getValue('number') || '';
        var result = callNASKSkill(SUPPLY_SKILL, 'kb_knowledge', kbTitle, kbText);
        if (result && result.topic_sys_id && result.topic_sys_id !== 'none') {
          writeSupplyClassification(runSysId, 'kb_knowledge', kbNumber, kbSysId, kbTitle, result);
          totalClassified++;
        }
      }

      // Process catalog items
      var catGr = new GlideRecord('sc_cat_item');
      catGr.addQuery('active', true);
      catGr.setLimit(limit);
      catGr.orderByDesc('sys_updated_on');
      catGr.query();
      while (catGr.next()) {
        var catSysId = catGr.getUniqueValue();
        // Skip if already classified
        if (alreadyClassified(catSysId)) continue;
        totalProcessed++;
        var catName = catGr.getValue('name') || '';
        var catDesc = ((catGr.getValue('short_description') || '') + ' ' + (catGr.getValue('description') || '')).replace(/<[^>]*>/g, '').substring(0, 3000);
        var result = callNASKSkill(SUPPLY_SKILL, 'sc_cat_item', catName, catDesc);
        if (result && result.topic_sys_id && result.topic_sys_id !== 'none') {
          writeSupplyClassification(runSysId, 'sc_cat_item', catName, catSysId, catName, result);
          totalClassified++;
        }
      }

      // Update run
      runGr.get(runSysId);
      runGr.setValue('u_status', 'Complete');
      runGr.setValue('u_total_incidents_analyzed', totalProcessed);
      runGr.update();

      data.runComplete = true;
      data.runSysId = runSysId;
      data.totalProcessed = totalProcessed;
      data.totalClassified = totalClassified;
      // Load results
      data.supplyData = buildCompanyHierarchy(['kb_knowledge', 'sc_cat_item']);
      var sf2 = [];
      for (var si2 = 0; si2 < data.supplyData.companies.length; si2++) {
        if (data.supplyData.companies[si2].name !== 'Unassigned') sf2.push(data.supplyData.companies[si2]);
      }
      data.supplyData.companies = sf2;
      data.registry = getRegistry(false);
    }

    // ═══════ RUN DEMAND ANALYSIS (invokes NASK) ═════════
    if (input.action === 'runDemandAnalysis') {
      handled = true;
      var DEMAND_SKILL = '158a0c9a2f0ffa90308dfb3fafa4e352';
      var incLimit = parseInt(input.limit) || 50;
      var dateFrom = input.dateFrom || '';
      var dateTo = input.dateTo || '';
      var reportName = input.reportName || 'Demand Analysis - ' + new GlideDateTime().getDisplayValue();

      // Build product lookup for matching
      var prodLookup = {};
      var plGr = new GlideRecord('u_x_snc_sd_company_product');
      var plHasActive = plGr.isValidField('u_active');
      if (plHasActive) plGr.addQuery('u_active', '!=', false);
      plGr.query();
      while (plGr.next()) {
        var plKey = (plGr.getValue('u_company_name') || '').toLowerCase() + '|' + (plGr.getValue('u_name') || '').toLowerCase();
        prodLookup[plKey] = plGr.getUniqueValue();
        var plProdOnly = (plGr.getValue('u_name') || '').toLowerCase();
        if (!prodLookup[plProdOnly]) prodLookup[plProdOnly] = plGr.getUniqueValue();
      }

      // Create run
      var dRunGr = new GlideRecord('u_x_snc_sd_analysis_run');
      dRunGr.initialize();
      dRunGr.setValue('u_name', reportName);
      dRunGr.setValue('u_status', 'Processing');
      dRunGr.setValue('u_run_date', new GlideDateTime());
      var dRunSysId = dRunGr.insert();

      var dTotal = 0, dClassified = 0, dUnmatched = 0;

      var incGr = new GlideRecord('incident');
      if (dateFrom) {
        var fromDT = dateFrom.indexOf(' ') === -1 ? dateFrom + ' 00:00:00' : dateFrom;
        incGr.addQuery('sys_created_on', '>=', fromDT);
      }
      if (dateTo) {
        var toDT = dateTo.indexOf(' ') === -1 ? dateTo + ' 23:59:59' : dateTo;
        incGr.addQuery('sys_created_on', '<=', toDT);
      }
      incGr.setLimit(incLimit);
      incGr.orderByDesc('sys_created_on');
      incGr.query();
      gs.info('SD DEMAND: Query returned ' + incGr.getRowCount() + ' incidents (dateFrom=' + dateFrom + ', dateTo=' + dateTo + ', limit=' + incLimit + ')');
      while (incGr.next()) {
        var incSysId = incGr.getUniqueValue();
        // Skip if already classified
        if (alreadyClassified(incSysId)) continue;
        dTotal++;
        var incTitle = incGr.getValue('short_description') || '';
        var incDesc = (incGr.getValue('description') || '').replace(/<[^>]*>/g, '');
        var incClose = (incGr.getValue('close_notes') || '').replace(/<[^>]*>/g, '');
        var fullDesc = (incTitle + '\n' + incDesc + '\n' + incClose).substring(0, 3000);
        var incNumber = incGr.getValue('number') || '';

        var result = callNASKSkill(DEMAND_SKILL, 'incident', incTitle, fullDesc);
        if (result && result.topic_sys_id && result.topic_sys_id !== 'none') {
          // Match product against registry
          var matchedProd = '';
          if (result.company && result.product) {
            var mKey = result.company.toLowerCase() + '|' + result.product.toLowerCase();
            if (prodLookup[mKey]) matchedProd = prodLookup[mKey];
          }
          if (!matchedProd && result.product) {
            var pKey = result.product.toLowerCase();
            if (prodLookup[pKey]) matchedProd = prodLookup[pKey];
          }

          var dCls = new GlideRecord('u_x_snc_sd_classification');
          dCls.initialize();
          dCls.setValue('u_analysis_run', dRunSysId);
          dCls.setValue('u_source_type', 'incident');
          dCls.setValue('u_source_number', incNumber);
          dCls.setValue('u_source_sys_id', incSysId);
          dCls.setValue('u_source_description', incTitle);
          dCls.setValue('u_close_notes', incClose);
          dCls.setValue('u_service_opportunity', result.topic_sys_id);
          dCls.setValue('u_confidence_score', result.confidence || 0);
          dCls.setValue('u_extracted_company', result.company || '');
          dCls.setValue('u_extracted_product', result.product || '');
          if (dCls.isValidField('u_product_type')) dCls.setValue('u_product_type', result.product_type || '');
          if (matchedProd) {
            dCls.setValue('u_product', matchedProd);
          } else if (result.company || result.product) {
            // Product found but not in registry — flag as unmatched
            dCls.setValue('u_in_other_bucket', true);
            dUnmatched++;
          }
          dCls.insert();
          dClassified++;
        }
      }

      dRunGr.get(dRunSysId);
      dRunGr.setValue('u_status', 'Complete');
      dRunGr.setValue('u_total_incidents_analyzed', dTotal);
      dRunGr.setValue('u_items_in_other_bucket', dUnmatched);
      dRunGr.update();

      data.runComplete = true;
      data.totalProcessed = dTotal;
      data.totalClassified = dClassified;
      data.totalUnmatched = dUnmatched;
      // Load unmatched for next step
      var unmatchedData = getUnmatchedGrouped();
      data.unmatched = unmatchedData.unmatched;
      data.noProduct = unmatchedData.noProduct;
      data.unmatchedCount = unmatchedData.unmatchedCount;
      data.noProductCount = unmatchedData.noProductCount;
    }

    if (input.action === 'loadGaps') {
      handled = true;
      data.gapData = buildCompanyHierarchy(['kb_knowledge', 'sc_cat_item', 'incident']);
      data.gapData.companies = computeGaps(data.gapData.companies);
      // Rename Unassigned to more descriptive label, keep it visible
      var filtered = [];
      for (var i = 0; i < data.gapData.companies.length; i++) {
        var co = data.gapData.companies[i];
        if (co.name === 'Unassigned') {
          co.name = '(No product identified)';
          // Rename product too
          for (var p = 0; p < co.products.length; p++) {
            if (co.products[p].name === 'Unassigned') co.products[p].name = '(General)';
          }
        }
        if (co.totalIncidents > 0 || co.totalKB > 0 || co.totalCatalog > 0) filtered.push(co);
      }
      data.gapData.companies = filtered;
    }

    if (input.action === 'loadReports') {
      handled = true;
      data.reports = getReports();
    }

    // ═══════ LOAD RECORDS (for drill-down modal) ════════
    if (input.action === 'loadRecords') {
      handled = true;
      var rTopicSysId = input.topicSysId || '';
      var rProductSysId = input.productSysId || '';
      var rSourceType = input.sourceType || '';
      
      data.records = [];
      var recGr = new GlideRecord('u_x_snc_sd_classification');
      if (rTopicSysId) recGr.addQuery('u_service_opportunity', rTopicSysId);
      if (rProductSysId) recGr.addQuery('u_product', rProductSysId);
      if (rSourceType) recGr.addQuery('u_source_type', rSourceType);
      recGr.setLimit(50);
      recGr.orderByDesc('u_confidence_score');
      recGr.query();
      while (recGr.next()) {
        data.records.push({
          number: recGr.getValue('u_source_number') || '',
          description: recGr.getValue('u_source_description') || '',
          confidence: parseInt(recGr.getValue('u_confidence_score')) || 0,
          company: recGr.getValue('u_extracted_company') || '',
          product: recGr.getValue('u_extracted_product') || '',
          sourceType: normalizeSourceType(recGr.getValue('u_source_type') || ''),
          sourceSysId: recGr.getValue('u_source_sys_id') || ''
        });
      }
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
      var unmatchedData = getUnmatchedGrouped();
      data.unmatched = unmatchedData.unmatched;
      data.noProduct = unmatchedData.noProduct;
      data.unmatchedCount = unmatchedData.unmatchedCount;
      data.noProductCount = unmatchedData.noProductCount;
    }

    // ═══════ ASSIGN EXISTING PRODUCT TO CLUSTER ═════════
    if (input.action === 'assignProductToCluster') {
      handled = true;
      var topicSysId = input.topicSysId || '';
      var productSysId = input.productSysId || '';
      
      if (topicSysId && productSysId) {
        var assignGr = new GlideRecord('u_x_snc_sd_classification');
        assignGr.addQuery('u_service_opportunity', topicSysId);
        assignGr.addQuery('u_source_type', 'incident');
        assignGr.addNullQuery('u_product');
        assignGr.query();
        var assignCount = 0;
        while (assignGr.next()) {
          assignGr.setValue('u_product', productSysId);
          assignGr.update();
          assignCount++;
        }
        gs.info('SD: Assigned product ' + productSysId + ' to ' + assignCount + ' incidents for topic ' + topicSysId);
      }
      
      // Reload unmatched data
      var refreshData = getUnmatchedGrouped();
      data.unmatched = refreshData.unmatched;
      data.noProduct = refreshData.noProduct;
      data.unmatchedCount = refreshData.unmatchedCount;
      data.noProductCount = refreshData.noProductCount;
    }

    // ═══════ CREATE PRODUCT AND ASSIGN TO CLUSTER ═══════
    if (input.action === 'createAndAssignToCluster') {
      handled = true;
      var newCompany = input.companyName || '';
      var newProduct = input.productName || '';
      var clusterTopicSysId = input.topicSysId || '';
      
      if (newProduct && clusterTopicSysId) {
        // Create the product
        var npGr2 = new GlideRecord('u_x_snc_sd_company_product');
        npGr2.initialize();
        npGr2.setValue('u_name', newProduct);
        npGr2.setValue('u_company_name', newCompany);
        npGr2.setValue('u_normalized_name', newProduct.toLowerCase());
        npGr2.setValue('u_verified', true);
        npGr2.setValue('u_mention_count', 0);
        if (npGr2.isValidField('u_active')) npGr2.setValue('u_active', true);
        var newProdSysId = npGr2.insert();
        
        // Assign to cluster
        var caGr2 = new GlideRecord('u_x_snc_sd_classification');
        caGr2.addQuery('u_service_opportunity', clusterTopicSysId);
        caGr2.addQuery('u_source_type', 'incident');
        caGr2.addNullQuery('u_product');
        caGr2.query();
        var caCount = 0;
        while (caGr2.next()) {
          caGr2.setValue('u_product', newProdSysId);
          caGr2.update();
          caCount++;
        }
        gs.info('SD: Created product ' + newProduct + ' and assigned to ' + caCount + ' incidents');
      }
      
      // Reload
      var refreshData2 = getUnmatchedGrouped();
      data.unmatched = refreshData2.unmatched;
      data.noProduct = refreshData2.noProduct;
      data.unmatchedCount = refreshData2.unmatchedCount;
      data.noProductCount = refreshData2.noProductCount;
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
      if (hasActive) isActive = gr.getValue('u_active') != '0' && gr.getValue('u_active') != 'false';
      var name = gr.getValue('u_name') || '';
      var company = gr.getValue('u_company_name') || '';
      items.push({
        sys_id: gr.getUniqueValue(),
        name: name,
        displayName: (name === company) ? '(General)' : name,
        company: company,
        verified: gr.getValue('u_verified') == '1' || gr.getValue('u_verified') == 'true',
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
    // Build registry lookup for recommendations
    var registryProducts = [];
    var rpGr = new GlideRecord('u_x_snc_sd_company_product');
    var rpHasActive = rpGr.isValidField('u_active');
    if (rpHasActive) rpGr.addQuery('u_active', '!=', false);
    rpGr.query();
    while (rpGr.next()) {
      registryProducts.push({
        sys_id: rpGr.getUniqueValue(),
        name: rpGr.getValue('u_name') || '',
        company: rpGr.getValue('u_company_name') || '',
        label: (rpGr.getValue('u_company_name') || '') + ' - ' + (rpGr.getValue('u_name') || '')
      });
    }

    // Map product_type to taxonomy category for grouping
    var typeToCategory = {
      'Email': 'Application Support',
      'Chat & collaboration': 'Application Support',
      'Productivity suite': 'Application Support',
      'Business application': 'Application Support',
      'Browser': 'Application Support',
      'Operating system': 'Application Support',
      'Telephony': 'Application Support',
      'Identity & auth': 'Account Management',
      'Laptop': 'Hardware Support',
      'Desktop': 'Hardware Support',
      'Mobile device': 'Hardware Support',
      'Monitor': 'Hardware Support',
      'Peripheral': 'Hardware Support',
      'Printer': 'Printing & Scanning',
      'Network': 'Network & Connectivity',
      'VPN & remote access': 'Network & Connectivity',
      'Security': 'Security & Compliance',
      'Storage & sync': 'Data & Storage'
    };

    // Section 1: Incidents where AI found a product not in registry
    var uGroups = {};
    var uGr = new GlideRecord('u_x_snc_sd_classification');
    uGr.addQuery('u_in_other_bucket', true);
    uGr.addQuery('u_source_type', 'incident');
    uGr.query();
    while (uGr.next()) {
      var uCompany = uGr.getValue('u_extracted_company') || 'Unknown';
      var uProduct = uGr.getValue('u_extracted_product') || '';
      var uKey = uCompany + '|' + uProduct;
      if (!uGroups[uKey]) uGroups[uKey] = { company: uCompany, product: uProduct, count: 0, samples: [] };
      uGroups[uKey].count++;
      if (uGroups[uKey].samples.length < 3) {
        uGroups[uKey].samples.push({ number: uGr.getValue('u_source_number') || '', description: uGr.getValue('u_source_description') || '' });
      }
    }
    var unmatchedCompanies = {};
    for (var ugk in uGroups) {
      var ug = uGroups[ugk];
      if (!unmatchedCompanies[ug.company]) unmatchedCompanies[ug.company] = { name: ug.company, products: [] };
      unmatchedCompanies[ug.company].products.push({ name: ug.product || '(Unidentified)', count: ug.count, samples: ug.samples });
    }
    var unmatchedResult = [];
    for (var uck in unmatchedCompanies) unmatchedResult.push(unmatchedCompanies[uck]);
    unmatchedResult.sort(function(a, b) { return b.products.reduce(function(s, p) { return s + p.count; }, 0) - a.products.reduce(function(s, p) { return s + p.count; }, 0); });

    // Section 2: Incidents with no product — group by Category → product_type
    var hasProductTypeField = new GlideRecord('u_x_snc_sd_classification').isValidField('u_product_type');
    
    var clusters = {};
    var npGr = new GlideRecord('u_x_snc_sd_classification');
    npGr.addQuery('u_source_type', 'incident');
    npGr.addNullQuery('u_product');
    npGr.addQuery('u_in_other_bucket', '!=', true);
    npGr.addNotNullQuery('u_service_opportunity');
    npGr.query();
    while (npGr.next()) {
      var productType = hasProductTypeField ? (npGr.getValue('u_product_type') || '') : '';
      var extractedCompany = npGr.getValue('u_extracted_company') || '';
      var extractedProduct = npGr.getValue('u_extracted_product') || '';
      var category = typeToCategory[productType] || 'Other';
      
      // Cluster key: category + product_type + extracted product (if any)
      var cKey;
      if (extractedProduct) {
        cKey = category + '|' + productType + '|' + extractedCompany + '|' + extractedProduct;
      } else {
        cKey = category + '|' + productType + '||';
      }

      if (!clusters[cKey]) {
        // Find recommendation from registry
        var rec = null;
        if (extractedProduct) {
          for (var rj = 0; rj < registryProducts.length; rj++) {
            if (registryProducts[rj].name.toLowerCase() === extractedProduct.toLowerCase()) {
              rec = { sys_id: registryProducts[rj].sys_id, label: registryProducts[rj].label };
              break;
            }
          }
        }
        clusters[cKey] = {
          category: category,
          productType: productType || 'Uncategorized',
          detectedCompany: extractedCompany,
          detectedProduct: extractedProduct,
          recommendation: rec,
          count: 0,
          samples: []
        };
      }
      clusters[cKey].count++;
      if (clusters[cKey].samples.length < 3) {
        clusters[cKey].samples.push({ number: npGr.getValue('u_source_number') || '', description: npGr.getValue('u_source_description') || '' });
      }
    }

    // Convert to category-grouped structure
    var categoryGroups = {};
    for (var clk in clusters) {
      var cl = clusters[clk];
      if (!categoryGroups[cl.category]) categoryGroups[cl.category] = { name: cl.category, clusters: [] };
      categoryGroups[cl.category].clusters.push(cl);
    }
    // Sort clusters within each category
    var noProductResult = [];
    for (var cgk in categoryGroups) {
      categoryGroups[cgk].clusters.sort(function(a, b) { return b.count - a.count; });
      noProductResult.push(categoryGroups[cgk]);
    }
    noProductResult.sort(function(a, b) {
      var aTotal = a.clusters.reduce(function(s, c) { return s + c.count; }, 0);
      var bTotal = b.clusters.reduce(function(s, c) { return s + c.count; }, 0);
      return bTotal - aTotal;
    });

    return {
      unmatched: unmatchedResult,
      noProduct: noProductResult,
      unmatchedCount: unmatchedResult.reduce(function(s, c) { return s + c.products.reduce(function(s2, p) { return s2 + p.count; }, 0); }, 0),
      noProductCount: Object.keys(clusters).length > 0 ? Object.keys(clusters).reduce(function(s, k) { return s + clusters[k].count; }, 0) : 0
    };
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
      var topicInfo = topicLookup[topicRef];
      if (!topicInfo) continue; // Skip unclassified — no valid topic match

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

  // ═══════ NASK SKILL HELPERS ════════════════════════
  function alreadyClassified(sourceSysId) {
    var check = new GlideRecord('u_x_snc_sd_classification');
    check.addQuery('u_source_sys_id', sourceSysId);
    check.setLimit(1);
    check.query();
    return check.hasNext();
  }

  function callNASKSkill(capabilityId, sourceType, title, description) {
    try {
      var request = {
        executionRequests: [{
          capabilityId: capabilityId,
          payload: {
            sourcetype: sourceType,
            title: title || '',
            description: description || ''
          }
        }]
      };
      var result = sn_one_extend.OneExtendUtil.execute(request);
      if (result && result.capabilities && result.capabilities[capabilityId]) {
        var responseStr = result.capabilities[capabilityId].response;
        if (responseStr) return JSON.parse(responseStr);
      }
      return null;
    } catch (e) {
      gs.warn('SD NASK: Error for "' + title + '": ' + e.message);
      return null;
    }
  }

  function writeSupplyClassification(runId, sourceType, sourceNumber, sourceSysId, sourceDesc, result) {
    var cls = new GlideRecord('u_x_snc_sd_classification');
    cls.initialize();
    cls.setValue('u_analysis_run', runId);
    cls.setValue('u_source_type', sourceType);
    cls.setValue('u_source_number', sourceNumber);
    cls.setValue('u_source_sys_id', sourceSysId);
    cls.setValue('u_source_description', sourceDesc);
    cls.setValue('u_service_opportunity', result.topic_sys_id);
    cls.setValue('u_confidence_score', result.confidence || 0);
    cls.setValue('u_extracted_company', result.company || '');
    cls.setValue('u_extracted_product', result.product || '');
    if (cls.isValidField('u_product_type')) cls.setValue('u_product_type', result.product_type || '');

    // Find or create product in registry
    if (result.company || result.product) {
      var prodSysId = findOrCreateProduct(runId, result.company, result.product);
      if (prodSysId) cls.setValue('u_product', prodSysId);
    }

    cls.insert();
  }

  function findOrCreateProduct(runId, company, product) {
    if (!product && !company) return '';
    var productName = product || '';
    var companyName = company || '';

    // If no specific product, use company name
    if (!productName) productName = companyName;
    if (!productName) return '';

    // Check existing
    var existing = new GlideRecord('u_x_snc_sd_company_product');
    existing.addQuery('u_name', productName);
    existing.addQuery('u_company_name', companyName);
    existing.query();
    if (existing.next()) {
      var mentions = parseInt(existing.getValue('u_mention_count')) || 0;
      existing.setValue('u_mention_count', mentions + 1);
      existing.update();
      return existing.getUniqueValue();
    }

    // Create new
    var np = new GlideRecord('u_x_snc_sd_company_product');
    np.initialize();
    np.setValue('u_name', productName);
    np.setValue('u_company_name', companyName);
    np.setValue('u_normalized_name', productName.toLowerCase());
    np.setValue('u_mention_count', 1);
    np.setValue('u_analysis_run', runId);
    np.setValue('u_verified', false);
    if (np.isValidField('u_active')) np.setValue('u_active', true);
    return np.insert();
  }

})();
