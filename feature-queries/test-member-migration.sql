-- Generated SQL for member feature
-- Generated at: 2025-08-09T11:22:31.329Z
-- Total queries: 12

-- Member Migration: Update picture1 column with new Directus IDs
-- Format: UPDATE pinoyphp_users SET picture1 = 'new_id' WHERE picture1 = 'old_filename';

UPDATE pinoyphp_users SET picture1 = 'test-1754738548919-wo8o8payz', is_migrate = 1 WHERE picture1 = '002493a95971.jpg';
UPDATE pinoyphp_users SET picture1 = 'test-1754738549522-wr8pep08n', is_migrate = 1 WHERE picture1 = '00d16e36759a.jpg';
UPDATE pinoyphp_users SET picture1 = 'test-1754738550125-ohq0y6cdl', is_migrate = 1 WHERE picture1 = '02f8f5bd5fcd.jpg';
UPDATE pinoyphp_users SET picture1 = 'test-1754738550727-nw8f21y8c', is_migrate = 1 WHERE picture1 = '072f9e2cfca3.jpg';
UPDATE pinoyphp_users SET picture1 = 'test-1754738551329-4xwfgkx26', is_migrate = 1 WHERE picture1 = '08ac9ae5762d.jpg';

-- Verification query:
SELECT COUNT(*) as migrated_records FROM pinoyphp_users WHERE is_migrate = 1;
-- Expected result: 5 records
