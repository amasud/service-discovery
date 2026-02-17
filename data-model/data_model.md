# Service Discovery — Data Model Reference v2

Last updated: 2026-02-17

---

## Classification Flow (Enforced Sequence)

```
Step 1: Run Supply Analysis (KB articles + catalog items)
  → AI classifies against taxonomy, extracts company/product
  → Writes classification records (source_type = kb_knowledge or sc_cat_item)
  → Auto-populates product registry

Step 2: Review Registry
  → View: Company → Product → Service Opportunity → Topic → KB/Catalog items
  → User confirms/merges/removes products

Step 3: Run Demand Analysis (incidents)
  → AI classifies against taxonomy, matches against confirmed registry
  → Writes classification records (source_type = incident)
  → Unmatched products flagged for review

Step 4: Review New Products from Incidents
  → User reviews unmatched products
  → Confirms new ones → adds to registry

Step 5: Configure Coverage Rules
  → Default coverage comes from topic's u_solution_type
  → Product owners can override per Topic × Product (e.g., "Password Reset for Oracle = KB only")

Step 6: View Gaps (computed dynamically)
  → For each Topic × Product with incidents:
      Look up coverage rule (override > topic default)
      "kb" → does a kb_knowledge classification exist?
      "catalog" → does a sc_cat_item classification exist?
      "both" → do both exist?
      "either" → does at least one exist?
      Missing = gap
```

---

## Default View Hierarchy

All views default to:
```
Company → Product → Service Opportunity → Topic
```

**Content Supply View (Steps 1-2):**
```
Microsoft
  └── Teams
       └── Collaboration & Productivity
            └── Chat app audio/video — KB: 2, Catalog: 1
            └── Chat app crashes — KB: 1, Catalog: 0
Oracle
  └── PeopleSoft
       └── Identity & Access Management
            └── Password reset — KB: 1, Catalog: 0
```

**Supply vs Demand View (Steps 3-6):**
```
Microsoft
  └── Teams
       └── Collaboration & Productivity
            └── Chat app audio/video — Incidents: 14, KB: 2, Catalog: 1 ✓
            └── Chat app crashes — Incidents: 10, KB: 1, Catalog: 0 ⚠ Gap
Oracle
  └── PeopleSoft
       └── Identity & Access Management
            └── Password reset — Incidents: 45, KB: 1, Catalog: 0 ⚠ Gap
```

---

## Tables

### u_x_snc_sd_opportunity (Service Opportunity Taxonomy)

Fixed taxonomy. Categories have no parent; topics reference a parent category by name.

| Field | Label | Type | Notes |
|---|---|---|---|
| sys_id | Sys ID | GUID | Primary key |
| u_name | Name | string | Topic or category name |
| u_parent_category | Parent Category | string | Empty = category, populated = topic |
| u_solution_type | Solution Type | string | Default coverage rule: "KB Article", "Catalog Item", "KB + Catalog Item", etc. |
| u_description | Description | string | |
| u_active | Active | boolean | |
| u_incident_volume | Incident Volume | integer | Historical/seeded volume |
| u_trend_pct | Trend % | integer | |
| u_automation_potential | Automation Potential | string | |
| u_universal_category | Universal Category | string | |
| u_number | Number | string | |

**Key relationships:**
- Categories: `u_parent_category` is empty, `u_solution_type` is empty
- Topics: `u_parent_category` = name of a category record
- `u_solution_type` provides the DEFAULT coverage rule for gap analysis

---

### u_x_snc_sd_classification (Classification Records)

Each record = one classified artifact (KB, catalog item, or incident) linked to a topic and optionally a product.

**Gap flags (u_kb_gap, u_catalog_gap) are DEPRECATED.** Gaps are now computed dynamically from coverage rules.

| Field | Label | Type | Notes |
|---|---|---|---|
| sys_id | Sys ID | GUID | Primary key |
| u_analysis_run | Analysis Run | reference → u_x_snc_sd_analysis_run | Which run created this |
| u_service_opportunity | Service Opportunity | reference → u_x_snc_sd_opportunity | Matched topic |
| u_product | Product | reference → u_x_snc_sd_company_product | Matched/extracted product |
| u_source_type | Source Type | string | "kb_knowledge", "sc_cat_item", or "incident" |
| u_source_number | Source Number | string | e.g., INC0067751, KB0000011 |
| u_source_sys_id | Source Sys ID | string | sys_id of the source record |
| u_source_description | Source Description | string | short_description/name of source |
| u_close_notes | Close Notes | string | For incidents only |
| u_confidence_score | Confidence Score | integer | AI classification confidence (0-100) |
| u_in_other_bucket | In Other Bucket | boolean | True if AI couldn't classify confidently |
| u_kb_gap | KB Gap | boolean | **DEPRECATED** — do not use for gap analysis |
| u_catalog_gap | Catalog Gap | boolean | **DEPRECATED** — do not use for gap analysis |

**Fields to add:**
- `u_extracted_company` (string) — Raw company name from AI before registry match
- `u_extracted_product` (string) — Raw product name from AI before registry match

---

### u_x_snc_sd_company_product (Product Registry)

Companies and products discovered from supply analysis or manually added.

| Field | Label | Type | Notes |
|---|---|---|---|
| sys_id | Sys ID | GUID | Primary key |
| u_name | Name | string | Product name |
| u_company_name | Company Name | string | Parent company |
| u_normalized_name | Normalized Name | string | Lowercase for matching |
| u_type | Type | string | |
| u_owner | Owner | reference → sys_user | |
| u_verified | Verified | boolean | Human-confirmed |
| u_is_master_entry | Is Master Entry | boolean | |
| u_mention_count | Mention Count | integer | Total mentions across all sources |
| u_incident_mentions | Incident Mentions | integer | Mentions from incidents only |
| u_analysis_run | Analysis Run | reference → u_x_snc_sd_analysis_run | Run that discovered this |
| u_inherited_from_run | Inherited From Run | reference → u_x_snc_sd_analysis_run | |
| u_registry_mode | Registry Mode | string | |

---

### u_x_snc_sd_coverage_rule (Coverage Rules) — NEW TABLE

Defines what content is required for a specific Topic × Product combination. Overrides the topic's default `u_solution_type`.

| Field | Label | Type | Notes |
|---|---|---|---|
| sys_id | Sys ID | GUID | Primary key |
| u_service_opportunity | Service Opportunity | reference → u_x_snc_sd_opportunity | Topic |
| u_product | Product | reference → u_x_snc_sd_company_product | Product from registry |
| u_required_coverage | Required Coverage | string | "kb", "catalog", "both", "either", "none" |
| u_overridden_by | Overridden By | reference → sys_user | Who set this override |
| u_override_reason | Override Reason | string | Why the default was changed |
| u_overridden_on | Overridden On | glide_date_time | When |

**How gap analysis uses this:**
1. For a given (Topic × Product), check if a coverage rule override exists
2. If yes → use `u_required_coverage` from the override
3. If no → derive default from the topic's `u_solution_type`:
   - "KB Article" → "kb"
   - "Catalog Item" → "catalog"
   - "KB + Catalog Item" or "Catalog Item + KB Article" → "both"
   - "Self-Service + KB Article" → "kb"
   - Contains "KB" and "Catalog" → "both"
   - Contains only "KB" → "kb"
   - Contains only "Catalog" → "catalog"
   - Otherwise → "either"
4. Compare against classification records:
   - "kb" → at least one `source_type=kb_knowledge` for this topic×product?
   - "catalog" → at least one `source_type=sc_cat_item` for this topic×product?
   - "both" → at least one of each?
   - "either" → at least one of either?
   - "none" → no content required (explicitly waived)
5. Missing = gap

---

### u_x_snc_sd_analysis_run (Analysis Runs)

| Field | Label | Type | Notes |
|---|---|---|---|
| sys_id | Sys ID | GUID | Primary key |
| u_name | Name | string | User-provided run name |
| u_number | Number | string | |
| u_description | Description | journal_input | |
| u_run_date | Run Date | glide_date_time | |
| u_run_by | Run By | reference → sys_user | |
| u_status | Status | string | "Processing", "Complete", "Error" |
| u_total_incidents_analyzed | Total Incidents Analyzed | integer | |
| u_gaps_identified | Gaps Identified | integer | |
| u_items_in_other_bucket | Items in Other Bucket | integer | |
| u_confidence_threshold | Confidence Threshold | integer | |
| u_registry_source | Registry Source | string | |
| u_inherit_from_run | Inherit From Run | reference → u_x_snc_sd_analysis_run | |

---

## Source Tables (ServiceNow OOTB)

### kb_knowledge (KB Articles)
Fields used for classification:
- `short_description` — title (primary signal)
- `text` — article body HTML (stripped before sending to AI)
- `topic` — SN native topic
- `category` — SN category
- `kb_knowledge_base` — reference to knowledge base
- `workflow_state` — "published", "draft", etc.
- `number` — e.g., KB0000011

### sc_cat_item (Catalog Items)
Fields used for classification:
- `name` — item name (primary signal)
- `short_description` — brief description
- `description` — full description HTML
- `category` — SN catalog category reference
- `sc_catalogs` — which catalog(s)
- `active` — boolean

### incident (Incidents)
Fields used for classification:
- `short_description` — title (primary signal)
- `description` — full description
- `close_notes` — resolution notes (rich with product mentions)
- `category` — SN category
- `subcategory` — SN subcategory
- `assignment_group` — reference to group
- `cmdb_ci` — CI reference
- `number` — e.g., INC0067751

---

## AI Skills

### SD-ClassifySupply
- Purpose: Classify KB articles and catalog items against taxonomy, extract company/product
- Skill sys_id: `2d09b3ce2f4bfa90308dfb3fafa4e3d9`
- Tools: GetTaxonomy (script)
- Inputs: sourcetype, title, description
- Output: JSON with topic_sys_id, topic_name, parent_category, company, product, confidence, reasoning

### SD-ClassifyDemand
- Purpose: Classify incidents against taxonomy, match company/product against confirmed registry
- Skill sys_id: `158a0c9a2f0ffa90308dfb3fafa4e352`
- Tools: GetTaxonomy (script), GetRegistry (script)
- Inputs: sourcetype, title, description
- Output: JSON with topic_sys_id, topic_name, parent_category, company, product, confidence, reasoning
