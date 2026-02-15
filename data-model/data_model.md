# Service Discovery — Data Model Reference

Last updated from instance: 2026-02-15

---

## u_x_snc_sd_opportunity (Service Opportunity Taxonomy)

The fixed taxonomy of service opportunities and topics. Categories have no parent; topics reference a parent category by name.

| Field | Label | Type | Notes |
|---|---|---|---|
| sys_id | Sys ID | GUID | Primary key |
| u_name | Name | string | Topic or category name |
| u_parent_category | Parent Category | string | Empty = category row; populated = topic row |
| u_solution_type | Solution Type | string | e.g., "KB Article", "Catalog Item", "Self-Service + KB Article" |
| u_description | Description | string | |
| u_active | Active | boolean | |
| u_incident_volume | Incident Volume | integer | Seeded/historical volume |
| u_trend_pct | Trend % | integer | Period-over-period change |
| u_automation_potential | Automation Potential | string | |
| u_universal_category | Universal Category | string | |
| u_number | Number | string | |

**Key relationships:**
- Categories: `u_parent_category` is empty, `u_solution_type` is empty
- Topics: `u_parent_category` = name of a category record

---

## u_x_snc_sd_classification (Classification Records)

Each record represents one classified artifact (incident, KB article, or catalog item) linked to a topic, product, and analysis run.

| Field | Label | Type | Notes |
|---|---|---|---|
| sys_id | Sys ID | GUID | Primary key |
| u_analysis_run | Analysis Run | reference → u_x_snc_sd_analysis_run | Which run created this |
| u_service_opportunity | Service Opportunity | reference → u_x_snc_sd_opportunity | Matched topic |
| u_product | Product | reference → u_x_snc_sd_company_product | Matched product (after registry exists) |
| u_source_type | Source Type | string | "incident", "kb_knowledge", or "sc_cat_item" |
| u_source_number | Source Number | string | e.g., INC0067751, KB0000011 |
| u_source_sys_id | Source Sys ID | string | sys_id of the source record |
| u_source_description | Source Description | string | short_description of the source |
| u_close_notes | Close Notes | string | For incidents only |
| u_kb_gap | KB Gap | boolean | Does this topic need a KB article? |
| u_catalog_gap | Catalog Gap | boolean | Does this topic need a catalog item? |
| u_confidence_score | Confidence Score | integer | AI classification confidence (0-100) |
| u_in_other_bucket | In Other Bucket | boolean | True if AI couldn't classify confidently |

**Proposed additions:**
- `u_extracted_company` (string) — Raw company name extracted by AI before registry matching
- `u_extracted_product` (string) — Raw product name extracted by AI before registry matching

---

## u_x_snc_sd_company_product (Product Registry)

Companies and products discovered from analysis. Can be AI-extracted or manually added.

| Field | Label | Type | Notes |
|---|---|---|---|
| sys_id | Sys ID | GUID | Primary key |
| u_name | Name | string | Product name |
| u_company_name | Company Name | string | Parent company |
| u_normalized_name | Normalized Name | string | Lowercase/cleaned version for matching |
| u_type | Type | string | |
| u_owner | Owner | reference → sys_user | |
| u_verified | Verified | boolean | Human-confirmed |
| u_is_master_entry | Is Master Entry | boolean | |
| u_mention_count | Mention Count | integer | Total mentions across all runs |
| u_incident_mentions | Incident Mentions | integer | Mentions from incidents specifically |
| u_analysis_run | Analysis Run | reference → u_x_snc_sd_analysis_run | Run that discovered this |
| u_inherited_from_run | Inherited From Run | reference → u_x_snc_sd_analysis_run | |
| u_registry_mode | Registry Mode | string | |

---

## u_x_snc_sd_analysis_run (Analysis Runs)

Each run represents one analysis session with filters, status, and results.

| Field | Label | Type | Notes |
|---|---|---|---|
| sys_id | Sys ID | GUID | Primary key |
| u_name | Name | string | User-provided run name |
| u_number | Number | string | |
| u_description | Description | journal_input | |
| u_run_date | Run Date | glide_date_time | When the run was executed |
| u_run_by | Run By | reference → sys_user | |
| u_status | Status | string | "Processing", "Complete", "Error" |
| u_total_incidents_analyzed | Total Incidents Analyzed | integer | |
| u_gaps_identified | Gaps Identified | integer | |
| u_items_in_other_bucket | Items in Other Bucket | integer | Unclassified count |
| u_confidence_threshold | Confidence Threshold | integer | Min confidence to auto-classify |
| u_registry_source | Registry Source | string | |
| u_inherit_from_run | Inherit From Run | reference → u_x_snc_sd_analysis_run | |

---

## Source Tables (ServiceNow OOTB)

### kb_knowledge (KB Articles)
Fields used for classification:
- `short_description` — Article title (primary signal)
- `text` — Article body HTML (needs stripping)
- `topic` — SN native topic
- `category` — SN category
- `kb_knowledge_base` — Reference to knowledge base
- `workflow_state` — "published", "draft", etc.
- `number` — e.g., KB0000011

### sc_cat_item (Catalog Items)
Fields used for classification:
- `name` — Item name (primary signal)
- `short_description` — Brief description
- `description` — Full description HTML
- `category` — SN catalog category reference
- `sc_catalogs` — Which catalog(s)
- `active` — Boolean
- `sys_class_name` — Item type (sc_cat_item, sc_cat_item_producer, etc.)

### incident (Incidents)
Fields used for classification:
- `short_description` — Incident title (primary signal)
- `description` — Full description
- `close_notes` — Resolution notes (rich with product mentions)
- `category` — SN category
- `subcategory` — SN subcategory
- `assignment_group` — Reference to group
- `cmdb_ci` — CI reference (potential product signal)
- `number` — e.g., INC0067751

---

## Classification Flow

```
Pass 1: KB Articles + Catalog Items (supply, source of truth)
  → AI classifies against taxonomy (topic)
  → AI extracts company + product (builds registry)

Pass 2: Human Review (product registry)
  → Confirm/merge/remove extracted companies and products

Pass 3: Incidents (demand)
  → AI classifies against taxonomy (topic)
  → AI matches company + product against confirmed registry
  → Unmatched products flagged for review

Pass 4: Gap Analysis (automatic)
  → For each (topic × product) with incidents:
      Does a KB classification exist? No → KB gap
      Does a catalog classification exist? No → Catalog gap
```
