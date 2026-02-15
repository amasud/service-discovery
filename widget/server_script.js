// SERVER SCRIPT - v4.1: Real classification + filter support
// CHANGES from v4:
//   1. startRun actually queries incidents with date range, assignment group, category, limit
//   2. startRun creates classification records linked to the run via u_analysis_run
//   3. Simple keyword matching for topic + product (Phase 2 replaces with AI)
//   4. Product rows will now appear because classifications have u_product set

(function() {

  var handled = false;

  // ═══════════ ACTION HANDLER ═══════════════════════════
  if (input && input.action) {

    // === LOAD RUN ===
    if (input.action === 'loadRun') {
      handled = true;
      var selectedRunId = input.selectedRunId || '';

      var productLookup = {};
      var plGr = new GlideRecord('u_x_snc_sd_company_product');
      plGr.query();
      while (plGr.next()) {
        productLookup[plGr.getUniqueValue()] = {
          name: plGr.getValue('u_name') || '',
          company: plGr.getValue('u_company_name') || ''
        };
      }

      var categories = [];
      var catGr = new GlideRecord('u_x_snc_sd_opportunity');
      catGr.addQuery('u_active', true);
      catGr.addQuery('u_parent_category', '');
      catGr.addQuery('u_solution_type', '');
      catGr.query();

      while (catGr.next()) {
        var catName = catGr.getValue('u_name');
        var topics = [];
        var topicGr = new GlideRecord('u_x_snc_sd_opportunity');
        topicGr.addQuery('u_active', true);
        topicGr.addQuery('u_parent_category', catName);
        topicGr.query();

        while (topicGr.next()) {
          var topicSysId = topicGr.getUniqueValue();
          var topicName = topicGr.getValue('u_name');
          var solution = topicGr.getValue('u_solution_type') || '';
          var volume = parseInt(topicGr.getValue('u_incident_volume')) || 0;

          var productGroups = {};
          var topicIncidents = [];
          var clsGr = new GlideRecord('u_x_snc_sd_classification');
          clsGr.addQuery('u_service_opportunity', topicSysId);
          if (selectedRunId) {
            clsGr.addQuery('u_analysis_run', selectedRunId);
          }
          clsGr.query();

          while (clsGr.next()) {
            var prodRef = clsGr.getValue('u_product');
            var prodName = 'Unspecified';
            var prodCompany = '';
            if (prodRef && productLookup[prodRef]) {
              prodName = productLookup[prodRef].name;
              prodCompany = productLookup[prodRef].company;
            }
            var inc = {
              id: clsGr.getValue('u_source_number') || '',
              title: clsGr.getValue('u_source_description') || '',
              close_notes: clsGr.getValue('u_close_notes') || '',
              product: prodName
            };
            topicIncidents.push(inc);
            if (!productGroups[prodName]) {
              productGroups[prodName] = {
                product: prodName, company: prodCompany,
                productSysId: prodRef || '', count: 0,
                kbGap: clsGr.getValue('u_kb_gap') == 'true',
                catGap: clsGr.getValue('u_catalog_gap') == 'true',
                incidents: []
              };
            }
            productGroups[prodName].count++;
            if (productGroups[prodName].incidents.length < 5) {
              productGroups[prodName].incidents.push(inc);
            }
          }

          var productList = [];
          for (var pk in productGroups) productList.push(productGroups[pk]);
          productList.sort(function(a, b) { return b.count - a.count; });

          var hasKBGap = solution.toLowerCase().indexOf('kb') > -1;
          var hasCatGap = solution.toLowerCase().indexOf('catalog') > -1;
          var classifiedCount = topicIncidents.length;
          var displayVolume = classifiedCount > 0 ? classifiedCount : volume;

          topics.push({
            sys_id: topicSysId, name: topicName, solution: solution,
            volume: displayVolume, kbGap: hasKBGap, catGap: hasCatGap,
            products: productList, productCount: productList.length,
            incidents: topicIncidents.slice(0, 10)
          });
        }

        var gapCount = 0, coveredCount = 0, catRecords = 0, combos = 0;
        for (var t = 0; t < topics.length; t++) {
          catRecords += topics[t].volume;
          combos += Math.max(topics[t].productCount, 1);
          if (topics[t].kbGap || topics[t].catGap) gapCount++;
          else coveredCount++;
        }

        if (topics.length > 0 || !selectedRunId) {
          categories.push({
            sys_id: catGr.getUniqueValue(), name: catName,
            pct: topics.length > 0 ? Math.round((coveredCount / topics.length) * 100) : 0,
            records: catRecords, trend: parseInt(catGr.getValue('u_trend_pct')) || 0,
            topicCount: combos, gapCount: gapCount, coveredCount: coveredCount,
            topics: topics
          });
        }
      }

      if (selectedRunId) {
        var filtered = [];
        for (var fc = 0; fc < categories.length; fc++) {
          var hasData = false;
          for (var ft = 0; ft < categories[fc].topics.length; ft++) {
            if (categories[fc].topics[ft].volume > 0) { hasData = true; break; }
          }
          if (hasData) filtered.push(categories[fc]);
        }
        categories = filtered;
      }

      categories.sort(function(a, b) { return b.records - a.records; });

      var totalTopics = 0, totalGaps = 0, totalCovered = 0;
      for (var i = 0; i < categories.length; i++) {
        totalTopics += categories[i].topicCount;
        totalGaps += categories[i].gapCount;
        totalCovered += categories[i].coveredCount;
      }

      data.categories = categories;
      data.totalTopics = totalTopics;
      data.totalGaps = totalGaps;
      data.totalCovered = totalCovered;
      data.coverPct = totalTopics > 0 ? Math.round((totalCovered / totalTopics) * 100) : 0;
      data.catCount = categories.length;
    }

    // === START RUN: Query incidents, classify, create records ===
    if (input.action === 'startRun') {
      handled = true;
      var filters = {};
      try { filters = JSON.parse(input.filters || '{}'); } catch(e) {}
      var sources = {};
      try { sources = JSON.parse(input.sources || '{}'); } catch(e) {}

      // 1. Create the run record
      var runGr = new GlideRecord('u_x_snc_sd_analysis_run');
      runGr.initialize();
      runGr.setValue('u_name', input.runName || 'Analysis - ' + new GlideDateTime().getDisplayValue());
      runGr.setValue('u_status', 'Processing');
      runGr.setValue('u_run_date', new GlideDateTime());
      var runSysId = runGr.insert();

      // 2. Build product lookup (name → sys_id)
      var prodLookup = {};
      var prodGr = new GlideRecord('u_x_snc_sd_company_product');
      prodGr.query();
      while (prodGr.next()) {
        prodLookup[prodGr.getValue('u_name').toLowerCase()] = prodGr.getUniqueValue();
      }

      // 3. Build opportunity lookup (topic name → details)
      var opptyLookup = {};
      var opptyGr = new GlideRecord('u_x_snc_sd_opportunity');
      opptyGr.addQuery('u_active', true);
      opptyGr.addNotNullQuery('u_parent_category');
      opptyGr.query();
      while (opptyGr.next()) {
        opptyLookup[opptyGr.getValue('u_name').toLowerCase()] = {
          sys_id: opptyGr.getUniqueValue(),
          name: opptyGr.getValue('u_name'),
          solution: opptyGr.getValue('u_solution_type') || '',
          parent: opptyGr.getValue('u_parent_category') || ''
        };
      }

      // 4. Query incidents using filters
      var incidentCount = 0;
      var classifiedCount = 0;
      var gapsFound = 0;

      if (sources.incidents) {
        var incGr = new GlideRecord('incident');

        // Date range filter
        var dateRange = parseInt(filters.dateRange) || 30;
        var startDate = new GlideDateTime();
        startDate.addDaysLocalTime(-dateRange);
        incGr.addQuery('sys_created_on', '>=', startDate);

        // Assignment group filter
        if (filters.assignmentGroup) {
          incGr.addQuery('assignment_group.name', 'CONTAINS', filters.assignmentGroup);
        }

        // Category filter
        if (filters.category) {
          incGr.addQuery('category', 'CONTAINS', filters.category);
        }

        // Record limit
        var recordLimit = parseInt(filters.limit) || 100;
        incGr.setLimit(recordLimit);
        incGr.orderByDesc('sys_created_on');
        incGr.query();

        while (incGr.next()) {
          incidentCount++;
          var incNumber = incGr.getValue('number') || '';
          var incDesc = incGr.getValue('short_description') || '';
          var incCloseNotes = incGr.getValue('close_notes') || '';
          var incCategory = (incGr.getValue('category') || '').toLowerCase();
          var incSubcategory = (incGr.getValue('subcategory') || '').toLowerCase();
          var fullText = (incDesc + ' ' + incCloseNotes + ' ' + incCategory + ' ' + incSubcategory).toLowerCase();

          // 5. Match incident to a service opportunity (keyword match)
          // Phase 2 replaces this with AI/semantic classification
          var matchedOppty = null;
          var bestScore = 0;
          for (var opptyKey in opptyLookup) {
            var keywords = opptyKey.split(/[\s\-\:\.]+/);
            var score = 0;
            for (var kw = 0; kw < keywords.length; kw++) {
              if (keywords[kw].length > 2 && fullText.indexOf(keywords[kw]) > -1) {
                score++;
              }
            }
            if (score > bestScore) {
              bestScore = score;
              matchedOppty = opptyLookup[opptyKey];
            }
          }

          // 6. Match to a product from registry
          var matchedProductId = '';
          for (var prodKey in prodLookup) {
            if (prodKey.length > 2 && fullText.indexOf(prodKey) > -1) {
              matchedProductId = prodLookup[prodKey];
              break;
            }
          }

          // 7. Create classification record linked to run
          if (matchedOppty && bestScore > 0) {
            classifiedCount++;
            var clsGr = new GlideRecord('u_x_snc_sd_classification');
            clsGr.initialize();
            clsGr.setValue('u_analysis_run', runSysId);
            clsGr.setValue('u_service_opportunity', matchedOppty.sys_id);
            clsGr.setValue('u_source_number', incNumber);
            clsGr.setValue('u_source_description', incDesc);
            clsGr.setValue('u_close_notes', incCloseNotes);

            if (matchedProductId) {
              clsGr.setValue('u_product', matchedProductId);
            }

            // Set gap flags based on solution type
            var sol = matchedOppty.solution.toLowerCase();
            clsGr.setValue('u_kb_gap', sol.indexOf('kb') > -1 ? 'true' : 'false');
            clsGr.setValue('u_catalog_gap', sol.indexOf('catalog') > -1 ? 'true' : 'false');
            clsGr.insert();

            if (sol.indexOf('kb') > -1 || sol.indexOf('catalog') > -1) {
              gapsFound++;
            }
          }
        }
      }

      // 8. Update run record with results
      runGr.get(runSysId);
      runGr.setValue('u_status', 'Complete');
      runGr.setValue('u_total_incidents_analyzed', incidentCount);
      runGr.setValue('u_gaps_identified', gapsFound);
      runGr.update();

      data.runSysId = runSysId;
      data.classified = classifiedCount;
    }

    // === CHECK RUN STATUS ===
    if (input.action === 'checkRunStatus') {
      handled = true;
      var statusGr = new GlideRecord('u_x_snc_sd_analysis_run');
      if (statusGr.get(input.runSysId)) {
        data.runStatus = statusGr.getValue('u_status') || 'Processing';
        data.runProgress = parseInt(statusGr.getValue('u_progress_pct')) || 0;
        if (data.runStatus === 'Complete') data.runProgress = 100;
      } else {
        data.runStatus = 'Error';
        data.runProgress = 0;
      }
    }

    // === LOAD RUNS ===
    if (input.action === 'loadRuns') {
      handled = true;
      var runs = [];
      var rGr = new GlideRecord('u_x_snc_sd_analysis_run');
      rGr.orderByDesc('u_run_date');
      rGr.setLimit(10);
      rGr.query();
      while (rGr.next()) {
        runs.push({
          sys_id: rGr.getUniqueValue(),
          name: rGr.getValue('u_name') || '',
          date: rGr.getDisplayValue('u_run_date') || '',
          status: rGr.getValue('u_status') || '',
          totalAnalyzed: parseInt(rGr.getValue('u_total_incidents_analyzed')) || 0,
          gapsFound: parseInt(rGr.getValue('u_gaps_identified')) || 0
        });
      }
      data.runs = runs;
    }
  }

  // ═══════════ MAIN DATA LOAD (initial page render) ════
  if (!handled) {

    var selectedRunId = (input && input.selectedRunId) ? input.selectedRunId : '';

    // ─── BUILD PRODUCT LOOKUP ─────────────────────────
    var productLookup = {};
    var plGr = new GlideRecord('u_x_snc_sd_company_product');
    plGr.query();
    while (plGr.next()) {
      productLookup[plGr.getUniqueValue()] = {
        name: plGr.getValue('u_name') || '',
        company: plGr.getValue('u_company_name') || ''
      };
    }

    // ─── GET CATEGORIES (parent level) ────────────────
    var categories = [];
    var catGr = new GlideRecord('u_x_snc_sd_opportunity');
    catGr.addQuery('u_active', true);
    catGr.addQuery('u_parent_category', '');
    catGr.addQuery('u_solution_type', '');
    catGr.orderByDesc('u_incident_volume');
    catGr.query();

    while (catGr.next()) {
      var catName = catGr.getValue('u_name');

      var topics = [];
      var topicGr = new GlideRecord('u_x_snc_sd_opportunity');
      topicGr.addQuery('u_active', true);
      topicGr.addQuery('u_parent_category', catName);
      topicGr.orderByDesc('u_incident_volume');
      topicGr.query();

      while (topicGr.next()) {
        var topicSysId = topicGr.getUniqueValue();
        var topicName = topicGr.getValue('u_name');
        var solution = topicGr.getValue('u_solution_type') || '';
        var volume = parseInt(topicGr.getValue('u_incident_volume')) || 0;

        var productGroups = {};
        var topicIncidents = [];
        var clsGr = new GlideRecord('u_x_snc_sd_classification');
        clsGr.addQuery('u_service_opportunity', topicSysId);
        if (selectedRunId) {
          clsGr.addQuery('u_analysis_run', selectedRunId);
        }
        clsGr.query();

        while (clsGr.next()) {
          var prodRef = clsGr.getValue('u_product');
          var prodName = 'Unspecified';
          var prodCompany = '';

          if (prodRef && productLookup[prodRef]) {
            prodName = productLookup[prodRef].name;
            prodCompany = productLookup[prodRef].company;
          }

          var inc = {
            id: clsGr.getValue('u_source_number') || '',
            title: clsGr.getValue('u_source_description') || '',
            close_notes: clsGr.getValue('u_close_notes') || '',
            product: prodName
          };

          topicIncidents.push(inc);

          if (!productGroups[prodName]) {
            productGroups[prodName] = {
              product: prodName,
              company: prodCompany,
              productSysId: prodRef || '',
              count: 0,
              kbGap: clsGr.getValue('u_kb_gap') == 'true',
              catGap: clsGr.getValue('u_catalog_gap') == 'true',
              incidents: []
            };
          }
          productGroups[prodName].count++;
          if (productGroups[prodName].incidents.length < 5) {
            productGroups[prodName].incidents.push(inc);
          }
        }

        var productList = [];
        for (var pk in productGroups) {
          productList.push(productGroups[pk]);
        }
        productList.sort(function(a, b) { return b.count - a.count; });

        var hasKBGap = solution.toLowerCase().indexOf('kb') > -1;
        var hasCatGap = solution.toLowerCase().indexOf('catalog') > -1;

        var classifiedCount = topicIncidents.length;
        var displayVolume = classifiedCount > 0 ? classifiedCount : volume;

        topics.push({
          sys_id: topicSysId,
          name: topicName,
          solution: solution,
          volume: displayVolume,
          kbGap: hasKBGap,
          catGap: hasCatGap,
          hasKB: false,
          hasCat: false,
          products: productList,
          productCount: productList.length,
          incidents: topicIncidents.slice(0, 10)
        });
      }

      var gapCount = 0, coveredCount = 0, catRecords = 0, catTopicProductCombos = 0;
      for (var t = 0; t < topics.length; t++) {
        catRecords += topics[t].volume;
        catTopicProductCombos += Math.max(topics[t].productCount, 1);
        if (topics[t].kbGap || topics[t].catGap) gapCount++;
        else coveredCount++;
      }

      var catCoveragePct = topics.length > 0 ? Math.round((coveredCount / topics.length) * 100) : 0;

      categories.push({
        sys_id: catGr.getUniqueValue(),
        name: catName,
        pct: catCoveragePct,
        records: catRecords,
        trend: parseInt(catGr.getValue('u_trend_pct')) || 0,
        topicCount: catTopicProductCombos,
        gapCount: gapCount,
        coveredCount: coveredCount,
        topics: topics
      });
    }

    categories.sort(function(a, b) { return b.records - a.records; });

    // ─── TOTALS ───────────────────────────────────────
    var totalTopics = 0, totalGaps = 0, totalCovered = 0;
    for (var i = 0; i < categories.length; i++) {
      totalTopics += categories[i].topicCount;
      totalGaps += categories[i].gapCount;
      totalCovered += categories[i].coveredCount;
    }

    // ─── PRODUCT REGISTRY ─────────────────────────────
    var registry = [];
    var regGr = new GlideRecord('u_x_snc_sd_company_product');
    regGr.orderBy('u_company_name');
    regGr.query();
    while (regGr.next()) {
      registry.push({
        sys_id: regGr.getUniqueValue(),
        name: regGr.getValue('u_name') || '',
        company: regGr.getValue('u_company_name') || '',
        mentions: parseInt(regGr.getValue('u_mention_count')) || 0,
        verified: regGr.getValue('u_verified') == 'true'
      });
    }

    var companies = {};
    for (var r = 0; r < registry.length; r++) {
      var co = registry[r].company || 'Other';
      if (!companies[co]) companies[co] = { name: co, products: [], totalMentions: 0, confirmed: false };
      companies[co].products.push(registry[r].name);
      companies[co].totalMentions += registry[r].mentions;
      if (registry[r].verified) companies[co].confirmed = true;
    }
    var companyList = [];
    for (var key in companies) {
      companyList.push(companies[key]);
    }
    companyList.sort(function(a, b) { return b.totalMentions - a.totalMentions; });

    // ─── RUNS ─────────────────────────────────────────
    var runs = [];
    var runGr = new GlideRecord('u_x_snc_sd_analysis_run');
    runGr.orderByDesc('u_run_date');
    runGr.setLimit(10);
    runGr.query();
    while (runGr.next()) {
      runs.push({
        sys_id: runGr.getUniqueValue(),
        name: runGr.getValue('u_name') || '',
        date: runGr.getDisplayValue('u_run_date') || '',
        status: runGr.getValue('u_status') || '',
        totalAnalyzed: parseInt(runGr.getValue('u_total_incidents_analyzed')) || 0,
        gapsFound: parseInt(runGr.getValue('u_gaps_identified')) || 0
      });
    }

    // ─── PASS TO CLIENT ───────────────────────────────
    data.categories = categories;
    data.totalTopics = totalTopics;
    data.totalGaps = totalGaps;
    data.totalCovered = totalCovered;
    data.coverPct = totalTopics > 0 ? Math.round((totalCovered / totalTopics) * 100) : 0;
    data.catCount = categories.length;
    data.registry = registry;
    data.companyList = companyList;
    data.runs = runs;
    data.selectedRunId = selectedRunId;
  }

})();
