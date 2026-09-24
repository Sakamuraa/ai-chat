-- nama model yang menjawab tiap pesan (untuk label display di bawah jawaban)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS model text;
