-- Generated SQL for detail feature
-- Generated at: 2025-08-09T12:01:36.299Z
-- Total queries: 48

-- Detail Migration: Using file_mapping table for better performance
-- Step 1: Create temporary file_mapping table
CREATE TEMPORARY TABLE file_mapping (
  old_filename VARCHAR(255) PRIMARY KEY,
  new_file_id VARCHAR(255) NOT NULL,
  INDEX(old_filename)
);

-- Step 2: Insert file mappings
INSERT INTO file_mapping (old_filename, new_file_id) VALUES
('02f8f5bd5fcd.jpg', 'f49135f8-1543-4bf7-b385-94c539c47929'),
('1abf39a26821.jpg', '0482b2ca-a232-4f71-8590-d54c623f8988'),
('1cfd3971acbf.jpg', 'ddb4c2c4-fc5e-451a-aed8-3bbd9711f1b0'),
('2adf2b8831e1.jpg', '3ac4e1d2-7601-4bec-afcd-145e5b491c9f'),
('2dcba7bc9039.jpg', 'ca60a583-6b37-4923-8788-8fb58e6e3316'),
('3b3542811cd0.jpg', '21505a76-c7f5-4b85-99e4-1f2b15b01ee2');

-- Step 3: Update using JOINs (much faster for large datasets)
UPDATE detail d
JOIN file_mapping fm ON d.pic = fm.old_filename
SET d.pic = fm.new_file_id;
UPDATE detail d
JOIN file_mapping fm ON d.pic2 = fm.old_filename
SET d.pic2 = fm.new_file_id;
UPDATE detail d
JOIN file_mapping fm ON d.pic3 = fm.old_filename
SET d.pic3 = fm.new_file_id;
UPDATE detail d
JOIN file_mapping fm ON d.pic4 = fm.old_filename
SET d.pic4 = fm.new_file_id;
UPDATE detail d
JOIN file_mapping fm ON d.pic5 = fm.old_filename
SET d.pic5 = fm.new_file_id;
UPDATE detail d
JOIN file_mapping fm ON d.dfile = fm.old_filename
SET d.dfile = fm.new_file_id;

-- Step 4: Verification queries
SELECT COUNT(*) as updated_pic FROM detail d
JOIN file_mapping fm ON d.pic = fm.new_file_id;
SELECT COUNT(*) as updated_pic2 FROM detail d
JOIN file_mapping fm ON d.pic2 = fm.new_file_id;
SELECT COUNT(*) as updated_pic3 FROM detail d
JOIN file_mapping fm ON d.pic3 = fm.new_file_id;
SELECT COUNT(*) as updated_pic4 FROM detail d
JOIN file_mapping fm ON d.pic4 = fm.new_file_id;
SELECT COUNT(*) as updated_pic5 FROM detail d
JOIN file_mapping fm ON d.pic5 = fm.new_file_id;
SELECT COUNT(*) as updated_dfile FROM detail d
JOIN file_mapping fm ON d.dfile = fm.new_file_id;

-- Step 5: Cleanup
DROP TEMPORARY TABLE file_mapping;
