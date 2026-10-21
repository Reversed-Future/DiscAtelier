CREATE TABLE edition_song_links (
    edition_id TEXT NOT NULL REFERENCES editions(id),
    position TEXT NOT NULL,
    title TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    PRIMARY KEY (edition_id, position, title)
);
INSERT OR REPLACE INTO edition_song_links (edition_id, position, title, payload)
SELECT s.edition_id, json_extract(l.value,'$.position'), json_extract(l.value,'$.title'),
       json_object('position',json_extract(l.value,'$.position'),'title',json_extract(l.value,'$.title'),'song',json(t.value))
FROM edition_supplements s, json_each(s.payload,'$.links') l, json_each(s.payload,'$.tracks') t
WHERE json_extract(l.value,'$.songId') = json_extract(t.value,'$.id');
