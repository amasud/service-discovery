# SD - Classify Supply (SDClassifySupply)

## Instance
- Skill sys_id: 2d09b3ce2f4bfa90308dfb3fafa4e3d9
- Config sys_id: c609f3ce2f4bfa90308dfb3fafa4e362
- Provider: AWS Claude (Amazon Bedrock Chat Completions)
- Temperature: 0

## Inputs
- sourcetype (String, mandatory)
- title (String, mandatory)
- description (String)

## Tool: GetTaxonomy (Script)
Queries u_x_snc_sd_opportunity for all active topics.
Returns formatted string: sys_id | Topic | Parent | Solution

## Prompt
[paste your finalized prompt here from the NASK prompt editor]

## Outputs
- response (default)
- error (default)
- status (default)
