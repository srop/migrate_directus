-- Generated SQL for topic feature
-- Generated at: 2025-08-09T12:01:36.299Z
-- Total queries: 13

-- Topic Migration: Update pic column with new Directus IDs
-- Format: UPDATE topic SET pic = 'new_id', is_migrate = 1 WHERE pic = 'old_filename';

UPDATE topic SET pic = 'f49135f8-1543-4bf7-b385-94c539c47929', is_migrate = 1 WHERE pic = '02f8f5bd5fcd.jpg';
UPDATE topic SET pic = '0482b2ca-a232-4f71-8590-d54c623f8988', is_migrate = 1 WHERE pic = '1abf39a26821.jpg';
UPDATE topic SET pic = 'ddb4c2c4-fc5e-451a-aed8-3bbd9711f1b0', is_migrate = 1 WHERE pic = '1cfd3971acbf.jpg';
UPDATE topic SET pic = '3ac4e1d2-7601-4bec-afcd-145e5b491c9f', is_migrate = 1 WHERE pic = '2adf2b8831e1.jpg';
UPDATE topic SET pic = 'ca60a583-6b37-4923-8788-8fb58e6e3316', is_migrate = 1 WHERE pic = '2dcba7bc9039.jpg';
UPDATE topic SET pic = '21505a76-c7f5-4b85-99e4-1f2b15b01ee2', is_migrate = 1 WHERE pic = '3b3542811cd0.jpg';

-- Verification query:
SELECT COUNT(*) as migrated_records FROM topic WHERE is_migrate = 1;
-- Expected result: 6 records
