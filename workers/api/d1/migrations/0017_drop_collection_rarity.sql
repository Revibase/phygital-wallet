-- Drop collection mint rarity index (no longer computed or shown).
DROP INDEX IF EXISTS idx_mint_rarity_score;
DROP TABLE IF EXISTS collection_mint_rarity;
DROP TABLE IF EXISTS collection_attr_counts;
DROP TABLE IF EXISTS collection_trait_counts;
DROP TABLE IF EXISTS collection_rarity_meta;
