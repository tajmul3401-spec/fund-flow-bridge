UPDATE providers
SET flow_config = jsonb_set(
  flow_config,
  '{add_funds,gateway_selector_chain}',
  '["#mfs > div > a:nth-child(1)", "a[data-toggle=\"tab\"][href=\"#CardSection\"]", "a[href=\"#CardSection\"]", "[data-bs-toggle=\"tab\"][data-bs-target=\"#CardSection\"]", "[data-bs-target=\"#CardSection\"]", "a:has-text(\"Card\"):visible", "button:has-text(\"Card\"):visible", "#CardSection #care-submit-button:visible", "#CardSection button#care-submit-button", "button#care-submit-button:visible"]'::jsonb
)
WHERE name = 'Best Follows';

UPDATE automation_jobs
SET status='PENDING', locked_by=NULL, locked_at=NULL, last_heartbeat_at=NULL, error=NULL, attempts=0
WHERE id IN ('da28ce23-3ab2-457f-a889-b4d4470c8475','84b499af-521f-4bca-83c2-7d6d9bf67e77');