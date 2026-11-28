CREATE TABLE yen_purchase_rates (
    purchase_date TEXT PRIMARY KEY NOT NULL,
    quote_date TEXT NOT NULL CHECK (quote_date <= purchase_date),
    cny_per_jpy TEXT NOT NULL,
    hkd_per_jpy TEXT NOT NULL
);
