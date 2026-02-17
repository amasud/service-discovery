// SD - Classify Demand: Batch Incident Classification Script
// Calls SDClassifyDemand NASK skill for each incident
// Matches against confirmed product registry (does not create new products)
//
// Skill sys_id: 158a0c9a2f0ffa90308dfb3fafa4e352

var CAPABILITY_ID = '158a0c9a2f0ffa90308dfb3fafa4e352';

// ─── CONFIGURATION ─────────────────────────────────────
var runName = 'Demand Classification - ' + new GlideDateTime().getDisplayValue();
var incLimit = 5;       // start small, increase after testing
var dateRangeDays = 90;

// ─── CREATE RUN RECORD ─────────────────────────────────
var runGr = new GlideRecord('u_x_snc_sd_analysis_run');
runGr.initialize();
runGr.setValue('u_name', runName);
runGr.setValue('u_status', 'Processing');
runGr.setValue('u_run_date', new GlideDateTime());
var runSysId = runGr.insert();
gs.info('SD: Created demand run ' + runSysId);

var totalProcessed = 0;
var totalClassified = 0;

// ─── BUILD PRODUCT LOOKUP (for matching AI response to registry) ───
var prodLookup = {};
var plGr = new GlideRecord('u_x_snc_sd_company_product');
plGr.query();
while (plGr.next()) {
  // Index by company|product
  var key = (plGr.getValue('u_company_name') || '').toLowerCase() + '|' + (plGr.getValue('u_name') || '').toLowerCase();
  prodLookup[key] = plGr.getUniqueValue();
  // Also index by product name alone
  var prodOnly = (plGr.getValue('u_name') || '').toLowerCase();
  if (!prodLookup[prodOnly]) prodLookup[prodOnly] = plGr.getUniqueValue();
}

// ─── HELPER: Call the NASK skill ───────────────────────
function classifyIncident(title, description) {
  try {
    var cleanDesc = description ? description.replace(/<[^>]*>/g, '').substring(0, 3000) : '';

    var request = {
      executionRequests: [{
        capabilityId: CAPABILITY_ID,
        payload: {
          inputValues: {
            sourcetype: 'incident',
            title: title || '',
            description: cleanDesc
          }
        }
      }]
    };

    var result = sn_one_extend.OneExtendUtil.execute(request);

    if (result && result.capabilities && result.capabilities[CAPABILITY_ID]) {
      var responseStr = result.capabilities[CAPABILITY_ID].response;
      if (responseStr) {
        return JSON.parse(responseStr);
      }
    }
    return null;
  } catch (e) {
    gs.warn('SD: Classification error for "' + title + '": ' + e.message);
    return null;
  }
}

// ─── HELPER: Match product from AI response to registry ─
function matchProduct(company, product) {
  if (!company && !product) return '';

  // Try company|product match first
  if (company && product) {
    var key = company.toLowerCase() + '|' + product.toLowerCase();
    if (prodLookup[key]) return prodLookup[key];
  }

  // Try product name alone
  if (product) {
    var prodKey = product.toLowerCase();
    if (prodLookup[prodKey]) return prodLookup[prodKey];
  }

  return '';
}

// ─── HELPER: Write classification record ───────────────
function writeClassification(runId, sourceNumber, sourceSysId, sourceDesc, closeNotes, result) {
  if (!result || !result.topic_sys_id || result.topic_sys_id === 'none') return false;

  var cls = new GlideRecord('u_x_snc_sd_classification');
  cls.initialize();
  cls.setValue('u_analysis_run', runId);
  cls.setValue('u_source_type', 'incident');
  cls.setValue('u_source_number', sourceNumber);
  cls.setValue('u_source_sys_id', sourceSysId);
  cls.setValue('u_source_description', sourceDesc);
  cls.setValue('u_close_notes', closeNotes);
  cls.setValue('u_service_opportunity', result.topic_sys_id);
  cls.setValue('u_confidence_score', result.confidence || 0);

  // For incidents, gap flags will be computed later by comparing against supply
  cls.setValue('u_kb_gap', 'false');
  cls.setValue('u_catalog_gap', 'false');

  // Match product from registry
  var prodSysId = matchProduct(result.company, result.product);
  if (prodSysId) {
    cls.setValue('u_product', prodSysId);
  }

  cls.insert();
  return true;
}

// ─── PROCESS INCIDENTS ─────────────────────────────────
gs.info('SD: Processing incidents...');
var incGr = new GlideRecord('incident');

// Date range filter
var startDate = new GlideDateTime();
startDate.addDaysLocalTime(-dateRangeDays);
incGr.addQuery('sys_created_on', '>=', startDate);

incGr.setLimit(incLimit);
incGr.orderByDesc('sys_created_on');
incGr.query();

while (incGr.next()) {
  totalProcessed++;
  var incNumber = incGr.getValue('number') || '';
  var incTitle = incGr.getValue('short_description') || '';
  var incDesc = incGr.getValue('description') || '';
  var incCloseNotes = incGr.getValue('close_notes') || '';
  var incSysId = incGr.getUniqueValue();

  // Combine description + close_notes for richer context
  var fullDesc = incTitle + '\n' + incDesc + '\n' + incCloseNotes;

  var result = classifyIncident(incTitle, fullDesc);
  if (result && writeClassification(runSysId, incNumber, incSysId, incTitle, incCloseNotes, result)) {
    totalClassified++;
    gs.info('SD: ' + incNumber + ' → ' + result.topic_name + ' | ' + result.company + '/' + result.product + ' | conf:' + result.confidence);
  } else {
    gs.info('SD: ' + incNumber + ' → no match');
  }
}

// ─── UPDATE RUN RECORD ─────────────────────────────────
runGr.get(runSysId);
runGr.setValue('u_status', 'Complete');
runGr.setValue('u_total_incidents_analyzed', totalProcessed);
runGr.update();

gs.info('SD: ✓ Demand run complete. Processed: ' + totalProcessed + ' | Classified: ' + totalClassified);
