## Schema changes

This project uses TypeORM with `db.synchronize: true` in `config/default.json`.
That means: add or modify a `@Column` on an entity in `src/entities/`, restart
the API, and the corresponding column is created/altered automatically. We do
not maintain SQL migration files. If you ever set `synchronize: false`, you
must generate migrations manually with `typeorm migration:generate`.
