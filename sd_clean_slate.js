// SD: Clean slate for supply analysis testing
// Run in Background Scripts

// ═══ Clear product registry ═══
var prodCount = 0;
var prodGr = new GlideRecord('u_x_snc_sd_company_product');
prodGr.query();
while (prodGr.next()) {
  prodGr.deleteRecord();
  prodCount++;
}
gs.info('SD CLEAN: Deleted ' + prodCount + ' product registry entries');

// ═══ Clear classification records ═══
var clsCount = 0;
var clsGr = new GlideRecord('u_x_snc_sd_classification');
clsGr.query();
while (clsGr.next()) {
  clsGr.deleteRecord();
  clsCount++;
}
gs.info('SD CLEAN: Deleted ' + clsCount + ' classification records');

// ═══ Clear coverage rules ═══
var ruleCount = 0;
var ruleGr = new GlideRecord('u_x_snc_sd_coverage_rule');
ruleGr.query();
while (ruleGr.next()) {
  ruleGr.deleteRecord();
  ruleCount++;
}
gs.info('SD CLEAN: Deleted ' + ruleCount + ' coverage rules');

// ═══ Clear analysis runs ═══
var runCount = 0;
var runGr = new GlideRecord('u_x_snc_sd_analysis_run');
runGr.query();
while (runGr.next()) {
  runGr.deleteRecord();
  runCount++;
}
gs.info('SD CLEAN: Deleted ' + runCount + ' analysis runs');

gs.info('SD CLEAN: ✓ All cleared. Ready for fresh supply test.');
