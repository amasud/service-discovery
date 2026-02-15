// SD - Classify Supply: Batch Classification Script (FIXED)
// Correct payload format: payload.inputValues
// Correct response path: result.capabilities[CAPABILITY_ID].response

var CAPABILITY_ID = '2d09b3ce2f4bfa90308dfb3fafa4e3d9';

// ─── CONFIGURATION ─────────────────────────────────────
var runName = 'Supply Classification - ' + new GlideDateTime().getDisplayValue();
var kbLimit = 50;
var catLimit = 50;
var kbState = 'published';

// ─── CREATE RUN RECORD ─────────────────────────────────
var runGr = new GlideRecord('u_x_snc_sd_analysis_run');
runGr.initialize();
runGr.setValue('u_name', runName);
runGr.setValue('u_status', 'Processing');
runGr.setValue('u_run_date', new GlideDateTime());
var runSysId = runGr.insert();
gs.info('SD: Created run ' + runSysId);

var totalProcessed = 0;
var totalClassified = 0;

// ─── HELPER: Call the NASK skill ───────────────────────
function classifyArtifact(sourceType, title, description) {
  try {
    var cleanDesc = description ? description.replace(/<[^>]*>/g, '').substring(0, 3000) : '';

    var request = {
      executionRequests: [{
        capabilityId: CAPABILITY_ID,
        payload: {
          inputValues: {
            sourcetype: sourceType,
            title: title || '',
            description: cleanDesc
          }
        }
      }]
    };

    var result = sn_one_extend.OneExtendUtil.execute(request);

    // Extract response from capabilities
    if (result && result.capabilities && result.capabilities[CAPABILITY_ID]) {
      var responseStr = result.capabilities[CAPABILITY_ID].response;
      if (responseStr) {
        var parsed = JSON.parse(responseStr);
        return parsed;
      }
    }
    return null;
  } catch (e) {
    gs.warn('SD: Classification error for "' + title + '": ' + e.message);
    return null;
  }
}

// ─── HELPER: Find or create product in registry ────────
function findOrCreateProduct(runId, company, product) {
  if (!product && !company) return '';
  var productName = product || company;
  var companyName = company || '';

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

  var newProd = new GlideRecord('u_x_snc_sd_company_product');
  newProd.initialize();
  newProd.setValue('u_name', productName);
  newProd.setValue('u_company_name', companyName);
  newProd.setValue('u_normalized_name', productName.toLowerCase());
  newProd.setValue('u_mention_count', 1);
  newProd.setValue('u_analysis_run', runId);
  newProd.setValue('u_verified', false);
  return newProd.insert();
}

// ─── HELPER: Write classification record ───────────────
function writeClassification(runId, sourceType, sourceNumber, sourceSysId, sourceDesc, result) {
  if (!result || !result.topic_sys_id || result.topic_sys_id === 'none') return false;

  var cls = new GlideRecord('u_x_snc_sd_classification');
  cls.initialize();
  cls.setValue('u_analysis_run', runId);
  cls.setValue('u_source_type', sourceType);
  cls.setValue('u_source_number', sourceNumber);
  cls.setValue('u_source_sys_id', sourceSysId);
  cls.setValue('u_source_description', sourceDesc);
  cls.setValue('u_service_opportunity', result.topic_sys_id);
  cls.setValue('u_confidence_score', result.confidence || 0);

  if (sourceType === 'kb_knowledge') {
    cls.setValue('u_kb_gap', 'false');
    cls.setValue('u_catalog_gap', 'true');
  } else if (sourceType === 'sc_cat_item') {
    cls.setValue('u_kb_gap', 'true');
    cls.setValue('u_catalog_gap', 'false');
  }

  if (result.company || result.product) {
    var prodSysId = findOrCreateProduct(runId, result.company, result.product);
    if (prodSysId) cls.setValue('u_product', prodSysId);
  }

  cls.insert();
  return true;
}

// ─── PROCESS KB ARTICLES ───────────────────────────────
gs.info('SD: Processing KB articles...');
var kbGr = new GlideRecord('kb_knowledge');
if (kbState) kbGr.addQuery('workflow_state', kbState);
kbGr.setLimit(kbLimit);
kbGr.orderByDesc('sys_updated_on');
kbGr.query();

while (kbGr.next()) {
  totalProcessed++;
  var kbTitle = kbGr.getValue('short_description') || '';
  var kbText = kbGr.getValue('text') || '';
  var kbNumber = kbGr.getValue('number') || '';
  var kbSysId = kbGr.getUniqueValue();

  var result = classifyArtifact('kb_knowledge', kbTitle, kbText);
  if (result && writeClassification(runSysId, 'kb_knowledge', kbNumber, kbSysId, kbTitle, result)) {
    totalClassified++;
    gs.info('SD: KB ' + kbNumber + ' → ' + result.topic_name + ' | ' + result.company + '/' + result.product + ' | conf:' + result.confidence);
  } else {
    gs.info('SD: KB ' + kbNumber + ' → no match');
  }
}

// ─── PROCESS CATALOG ITEMS ─────────────────────────────
gs.info('SD: Processing catalog items...');
var catGr = new GlideRecord('sc_cat_item');
catGr.addQuery('active', true);
catGr.setLimit(catLimit);
catGr.orderByDesc('sys_updated_on');
catGr.query();

while (catGr.next()) {
  totalProcessed++;
  var catName = catGr.getValue('name') || '';
  var catDesc = (catGr.getValue('short_description') || '') + ' ' + (catGr.getValue('description') || '');
  var catSysId = catGr.getUniqueValue();

  var result = classifyArtifact('sc_cat_item', catName, catDesc);
  if (result && writeClassification(runSysId, 'sc_cat_item', catName, catSysId, catName, result)) {
    totalClassified++;
    gs.info('SD: Cat "' + catName + '" → ' + result.topic_name + ' | ' + result.company + '/' + result.product + ' | conf:' + result.confidence);
  } else {
    gs.info('SD: Cat "' + catName + '" → no match');
  }
}

// ─── UPDATE RUN RECORD ─────────────────────────────────
runGr.get(runSysId);
runGr.setValue('u_status', 'Complete');
runGr.setValue('u_total_incidents_analyzed', totalProcessed);
runGr.update();

gs.info('SD: ✓ Run complete. Processed: ' + totalProcessed + ' | Classified: ' + totalClassified);
