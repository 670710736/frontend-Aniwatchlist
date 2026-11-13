package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore is the persistent implementation of the AniWatchlist stores.
type PostgresStore struct {
	Pool *pgxpool.Pool
}

func OpenPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &PostgresStore{Pool: pool}, nil
}

func (s *PostgresStore) Close() { s.Pool.Close() }

func (s *PostgresStore) ListWatchlist(ctx context.Context, memberID int) ([]WatchlistEntry, error) {
	if memberID <= 0 {
		return nil, ErrInvalidMemberID
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT member_id, anime_id, status, progress
		FROM watchlist_entries WHERE member_id = $1
		ORDER BY updated_at DESC, anime_id`, memberID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]WatchlistEntry, 0)
	for rows.Next() {
		var item WatchlistEntry
		if err := rows.Scan(&item.MemberID, &item.AnimeID, &item.Status, &item.Progress); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) SetWatchlistEntry(ctx context.Context, item WatchlistEntry) (WatchlistEntry, error) {
	if item.MemberID <= 0 {
		return WatchlistEntry{}, ErrInvalidMemberID
	}
	if item.AnimeID <= 0 {
		return WatchlistEntry{}, ErrInvalidAnimeID
	}
	if item.Status == "" {
		item.Status = StatusPlanned
	}
	if !validStatus(item.Status) {
		return WatchlistEntry{}, ErrInvalidStatus
	}
	if item.Progress < 0 {
		return WatchlistEntry{}, ErrInvalidProgress
	}
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO watchlist_entries (member_id, anime_id, status, progress)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (member_id, anime_id) DO UPDATE
		SET status = EXCLUDED.status, progress = EXCLUDED.progress, updated_at = now()
		RETURNING member_id, anime_id, status, progress`,
		item.MemberID, item.AnimeID, item.Status, item.Progress).
		Scan(&item.MemberID, &item.AnimeID, &item.Status, &item.Progress)
	return item, err
}

func (s *PostgresStore) DeleteWatchlistEntry(ctx context.Context, memberID, animeID int) error {
	if memberID <= 0 {
		return ErrInvalidMemberID
	}
	if animeID <= 0 {
		return ErrInvalidAnimeID
	}
	tag, err := s.Pool.Exec(ctx, `DELETE FROM watchlist_entries WHERE member_id=$1 AND anime_id=$2`, memberID, animeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) ListFavorites(ctx context.Context, memberID int) ([]FavoriteEntry, error) {
	if memberID <= 0 {
		return nil, ErrInvalidMemberID
	}
	rows, err := s.Pool.Query(ctx, `SELECT member_id, anime_id FROM favorites WHERE member_id=$1 ORDER BY added_at DESC`, memberID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]FavoriteEntry, 0)
	for rows.Next() {
		var item FavoriteEntry
		if err := rows.Scan(&item.MemberID, &item.AnimeID); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) FavoriteCount(ctx context.Context, animeID int) (int, error) {
	if animeID <= 0 {
		return 0, ErrInvalidAnimeID
	}
	var count int
	err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM favorites WHERE anime_id=$1`, animeID).Scan(&count)
	return count, err
}

func (s *PostgresStore) AddFavorite(ctx context.Context, memberID, animeID int) (FavoriteEntry, error) {
	if memberID <= 0 {
		return FavoriteEntry{}, ErrInvalidMemberID
	}
	if animeID <= 0 {
		return FavoriteEntry{}, ErrInvalidAnimeID
	}
	_, err := s.Pool.Exec(ctx, `INSERT INTO favorites (member_id, anime_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, memberID, animeID)
	return FavoriteEntry{MemberID: memberID, AnimeID: animeID}, err
}

func (s *PostgresStore) RemoveFavorite(ctx context.Context, memberID, animeID int) error {
	if memberID <= 0 {
		return ErrInvalidMemberID
	}
	if animeID <= 0 {
		return ErrInvalidAnimeID
	}
	tag, err := s.Pool.Exec(ctx, `DELETE FROM favorites WHERE member_id=$1 AND anime_id=$2`, memberID, animeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) IsFavorite(ctx context.Context, memberID, animeID int) (bool, error) {
	if memberID <= 0 {
		return false, ErrInvalidMemberID
	}
	if animeID <= 0 {
		return false, ErrInvalidAnimeID
	}
	var exists bool
	err := s.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM favorites WHERE member_id=$1 AND anime_id=$2)`, memberID, animeID).Scan(&exists)
	return exists, err
}

func (s *PostgresStore) CreateMember(ctx context.Context, email, hash, name string) (Member, error) {
	member := Member{Email: strings.ToLower(strings.TrimSpace(email)), DisplayName: strings.TrimSpace(name)}
	if member.Email == "" || hash == "" || member.DisplayName == "" || len([]rune(member.DisplayName)) > 50 {
		return Member{}, ErrInvalidMember
	}
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO members (email, password_hash, display_name)
		VALUES ($1, $2, $3) RETURNING id, role`, member.Email, hash, member.DisplayName).
		Scan(&member.ID, &member.Role)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return Member{}, ErrEmailTaken
	}
	return member, err
}

func (s *PostgresStore) MemberByEmail(ctx context.Context, email string) (Member, error) {
	var member Member
	err := s.Pool.QueryRow(ctx, `
		SELECT id, email, display_name, role, password_hash
		FROM members WHERE lower(email)=$1`, strings.ToLower(strings.TrimSpace(email))).
		Scan(&member.ID, &member.Email, &member.DisplayName, &member.Role, &member.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return Member{}, ErrNotFound
	}
	return member, err
}

func (s *PostgresStore) MemberByID(ctx context.Context, id int64) (Member, error) {
	var member Member
	err := s.Pool.QueryRow(ctx, `
		SELECT id, email, display_name, role, created_at FROM members WHERE id=$1`, id).
		Scan(&member.ID, &member.Email, &member.DisplayName, &member.Role, &member.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Member{}, ErrNotFound
	}
	return member, err
}

func (s *PostgresStore) MemberPasswordHash(ctx context.Context, id int64) (string, error) {
	if id <= 0 {
		return "", ErrInvalidMemberID
	}
	var hash string
	err := s.Pool.QueryRow(ctx, `SELECT password_hash FROM members WHERE id=$1`, id).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return hash, err
}

func (s *PostgresStore) UpdatePasswordHash(ctx context.Context, id int64, hash string) error {
	if id <= 0 {
		return ErrInvalidMemberID
	}
	if hash == "" {
		return ErrInvalidMember
	}
	tag, err := s.Pool.Exec(ctx, `UPDATE members SET password_hash=$2 WHERE id=$1`, id, hash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) ListMembers(ctx context.Context) ([]Member, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id, email, display_name, role, created_at FROM members ORDER BY created_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Member, 0)
	for rows.Next() {
		var item Member
		if err := rows.Scan(&item.ID, &item.Email, &item.DisplayName, &item.Role, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) UpdateMemberRole(ctx context.Context, id int64, role string) (Member, error) {
	if id <= 0 {
		return Member{}, ErrInvalidMemberID
	}
	if role != "member" && role != "admin" {
		return Member{}, ErrInvalidRole
	}
	var member Member
	err := s.Pool.QueryRow(ctx, `
		UPDATE members SET role=$2, updated_at=now() WHERE id=$1
		RETURNING id, email, display_name, role, created_at`, id, role).
		Scan(&member.ID, &member.Email, &member.DisplayName, &member.Role, &member.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Member{}, ErrNotFound
	}
	return member, err
}

func (s *PostgresStore) Stats(ctx context.Context) (AdminStats, error) {
	var stats AdminStats
	err := s.Pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM anime), (SELECT count(*) FROM members),
		       (SELECT count(*) FROM reviews), (SELECT count(*) FROM watchlist_entries),
		       (SELECT count(*) FROM favorites)`).
		Scan(&stats.AnimeCount, &stats.MemberCount, &stats.ReviewCount, &stats.WatchlistEntryCount, &stats.FavoriteEntryCount)
	return stats, err
}

func (s *PostgresStore) AdminGetAnime(ctx context.Context, id int) (Anime, error) {
	return s.GetAnime(ctx, id)
}

func (s *PostgresStore) GetAnime(ctx context.Context, id int) (Anime, error) {
	var anime Anime
	var titleJSON, coverJSON []byte
	err := s.Pool.QueryRow(ctx, `
		SELECT id, title, cover_image, banner_image, description, average_score,
		       popularity, episodes, status, format FROM anime WHERE id=$1`, id).
		Scan(&anime.ID, &titleJSON, &coverJSON, &anime.BannerImage, &anime.Description, &anime.AverageScore,
			&anime.Popularity, &anime.Episodes, &anime.Status, &anime.Format)
	if errors.Is(err, pgx.ErrNoRows) {
		return Anime{}, ErrNotFound
	}
	if err != nil {
		return Anime{}, err
	}
	if err := json.Unmarshal(titleJSON, &anime.Title); err != nil {
		return Anime{}, err
	}
	if err := json.Unmarshal(coverJSON, &anime.CoverImage); err != nil {
		return Anime{}, err
	}
	genres, err := s.animeGenres(ctx, id)
	if err != nil {
		return Anime{}, err
	}
	anime.Genres = genres
	return anime, nil
}

func (s *PostgresStore) SearchAnime(ctx context.Context, search, genre string) ([]Anime, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT a.id, a.title, a.cover_image, a.banner_image, a.description, a.average_score,
		       a.popularity, a.episodes, a.status, a.format,
		       COALESCE(array_agg(ag.genre ORDER BY ag.position) FILTER (WHERE ag.genre IS NOT NULL), '{}')
		FROM anime a LEFT JOIN anime_genres ag ON ag.anime_id=a.id
		WHERE ($1 = '' OR lower(coalesce(a.title->>'userPreferred',a.title->>'english',a.title->>'romaji',a.title->>'native','')) LIKE '%' || lower($1) || '%'
		       OR lower(coalesce(a.title->>'romaji','')) LIKE '%' || lower($1) || '%'
		       OR lower(coalesce(a.title->>'english','')) LIKE '%' || lower($1) || '%'
		       OR lower(coalesce(a.title->>'native','')) LIKE '%' || lower($1) || '%')
		  AND ($2 = '' OR EXISTS (SELECT 1 FROM anime_genres f WHERE f.anime_id=a.id AND lower(f.genre)=lower($2)))
		  AND NOT EXISTS (SELECT 1 FROM anime_genres e WHERE e.anime_id=a.id AND lower(e.genre)='ecchi')
		GROUP BY a.id ORDER BY a.popularity DESC, a.id LIMIT 100`, strings.TrimSpace(search), strings.TrimSpace(genre))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Anime, 0)
	for rows.Next() {
		var anime Anime
		var titleJSON, coverJSON []byte
		if err := rows.Scan(&anime.ID, &titleJSON, &coverJSON, &anime.BannerImage, &anime.Description,
			&anime.AverageScore, &anime.Popularity, &anime.Episodes, &anime.Status, &anime.Format, &anime.Genres); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(titleJSON, &anime.Title); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(coverJSON, &anime.CoverImage); err != nil {
			return nil, err
		}
		items = append(items, anime)
	}
	return items, rows.Err()
}

func (s *PostgresStore) animeGenres(ctx context.Context, id int) ([]string, error) {
	rows, err := s.Pool.Query(ctx, `SELECT genre FROM anime_genres WHERE anime_id=$1 ORDER BY position`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	genres := make([]string, 0)
	for rows.Next() {
		var genre string
		if err := rows.Scan(&genre); err != nil {
			return nil, err
		}
		genres = append(genres, genre)
	}
	return genres, rows.Err()
}

func (s *PostgresStore) UpsertAnime(ctx context.Context, anime Anime) error {
	if err := validateStoredAnime(anime); err != nil {
		return err
	}
	titleJSON, err := json.Marshal(anime.Title)
	if err != nil {
		return err
	}
	coverJSON, err := json.Marshal(anime.CoverImage)
	if err != nil {
		return err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `INSERT INTO anime (id,title,cover_image,banner_image,description,average_score,popularity,episodes,status,format)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,cover_image=EXCLUDED.cover_image,
		banner_image=EXCLUDED.banner_image,description=EXCLUDED.description,average_score=EXCLUDED.average_score,
		popularity=EXCLUDED.popularity,episodes=EXCLUDED.episodes,status=EXCLUDED.status,format=EXCLUDED.format,
		source_updated_at=now(),updated_at=now()`, anime.ID, titleJSON, coverJSON, anime.BannerImage,
		anime.Description, anime.AverageScore, anime.Popularity, anime.Episodes, anime.Status, anime.Format)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM anime_genres WHERE anime_id=$1`, anime.ID); err != nil {
		return err
	}
	if err := putGenres(ctx, tx, anime.ID, anime.Genres); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PostgresStore) CreateAnime(ctx context.Context, anime Anime) (Anime, error) {
	if err := validateStoredAnime(anime); err != nil {
		return Anime{}, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Anime{}, err
	}
	defer tx.Rollback(ctx)
	if err := insertAnime(ctx, tx, anime); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Anime{}, ErrAnimeExists
		}
		return Anime{}, err
	}
	if err := putGenres(ctx, tx, anime.ID, anime.Genres); err != nil {
		return Anime{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Anime{}, err
	}
	return anime, nil
}

func (s *PostgresStore) UpdateAnime(ctx context.Context, id int, anime Anime) (Anime, error) {
	if id <= 0 {
		return Anime{}, ErrInvalidAnimeID
	}
	anime.ID = id
	if err := validateStoredAnime(anime); err != nil {
		return Anime{}, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Anime{}, err
	}
	defer tx.Rollback(ctx)
	titleJSON, _ := json.Marshal(anime.Title)
	coverJSON, _ := json.Marshal(anime.CoverImage)
	tag, err := tx.Exec(ctx, `UPDATE anime SET title=$2, cover_image=$3, banner_image=$4, description=$5,
		average_score=$6, popularity=$7, episodes=$8, status=$9, format=$10,
		source_updated_at=now(), updated_at=now() WHERE id=$1`, id, titleJSON, coverJSON,
		anime.BannerImage, anime.Description, anime.AverageScore, anime.Popularity, anime.Episodes, anime.Status, anime.Format)
	if err != nil {
		return Anime{}, err
	}
	if tag.RowsAffected() == 0 {
		return Anime{}, ErrNotFound
	}
	if _, err := tx.Exec(ctx, `DELETE FROM anime_genres WHERE anime_id=$1`, id); err != nil {
		return Anime{}, err
	}
	if err := putGenres(ctx, tx, id, anime.Genres); err != nil {
		return Anime{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Anime{}, err
	}
	return anime, nil
}

func (s *PostgresStore) DeleteAnime(ctx context.Context, id int) error {
	tag, err := s.Pool.Exec(ctx, `DELETE FROM anime WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) ListGenres(ctx context.Context) ([]string, error) {
	rows, err := s.Pool.Query(ctx, `SELECT name FROM genres ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]string, 0)
	for rows.Next() {
		var item string
		if err := rows.Scan(&item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) SaveReview(ctx context.Context, memberID int64, animeID int64, text string, score *int16) (Review, error) {
	if memberID <= 0 {
		return Review{}, ErrInvalidMemberID
	}
	if animeID <= 0 {
		return Review{}, ErrInvalidAnimeID
	}
	text = strings.TrimSpace(text)
	if len([]rune(text)) < 10 {
		return Review{}, ErrInvalidReview
	}
	if score != nil && (*score < 1 || *score > 10) {
		return Review{}, ErrInvalidReviewScore
	}
	var reviewID int64
	err := s.Pool.QueryRow(ctx, `INSERT INTO reviews (member_id, anime_id, text, score)
		VALUES ($1,$2,$3,$4) ON CONFLICT (member_id, anime_id) DO UPDATE
		SET text=EXCLUDED.text, score=EXCLUDED.score, updated_at=now()
		RETURNING id`, memberID, animeID, text, score).Scan(&reviewID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return Review{}, ErrNotFound
		}
		return Review{}, err
	}
	return s.reviewByID(ctx, reviewID)
}

func (s *PostgresStore) ListReviews(ctx context.Context, animeID int64) ([]Review, error) {
	rows, err := s.Pool.Query(ctx, `SELECT r.id,r.member_id,r.anime_id,r.text,r.score,r.created_at,r.updated_at,m.display_name
		FROM reviews r JOIN members m ON m.id=r.member_id WHERE r.anime_id=$1 ORDER BY r.created_at DESC`, animeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Review, 0)
	for rows.Next() {
		var item Review
		if err := rows.Scan(&item.ID, &item.MemberID, &item.AnimeID, &item.Text, &item.Score,
			&item.CreatedAt, &item.UpdatedAt, &item.Member.DisplayName); err != nil {
			return nil, err
		}
		item.Member.ID = item.MemberID
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) ListMemberReviews(ctx context.Context, memberID int64) ([]Review, error) {
	if memberID <= 0 {
		return nil, ErrInvalidMemberID
	}
	rows, err := s.Pool.Query(ctx, `SELECT r.id,r.member_id,r.anime_id,r.text,r.score,r.created_at,r.updated_at,m.display_name
		FROM reviews r JOIN members m ON m.id=r.member_id WHERE r.member_id=$1 ORDER BY r.created_at DESC`, memberID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Review, 0)
	for rows.Next() {
		var item Review
		if err := rows.Scan(&item.ID, &item.MemberID, &item.AnimeID, &item.Text, &item.Score,
			&item.CreatedAt, &item.UpdatedAt, &item.Member.DisplayName); err != nil {
			return nil, err
		}
		item.Member.ID = item.MemberID
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) DeleteReview(ctx context.Context, memberID, reviewID int64) error {
	if memberID <= 0 {
		return ErrInvalidMemberID
	}
	if reviewID <= 0 {
		return ErrNotFound
	}
	tag, err := s.Pool.Exec(ctx, `DELETE FROM reviews WHERE id=$1 AND member_id=$2`, reviewID, memberID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteReviewByID removes a review regardless of owner. Call only from an
// admin-authorized handler.
func (s *PostgresStore) DeleteReviewByID(ctx context.Context, reviewID int64) error {
	if reviewID <= 0 {
		return ErrNotFound
	}
	tag, err := s.Pool.Exec(ctx, `DELETE FROM reviews WHERE id=$1`, reviewID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) reviewByID(ctx context.Context, id int64) (Review, error) {
	var item Review
	err := s.Pool.QueryRow(ctx, `SELECT r.id,r.member_id,r.anime_id,r.text,r.score,r.created_at,r.updated_at,m.display_name
		FROM reviews r JOIN members m ON m.id=r.member_id WHERE r.id=$1`, id).
		Scan(&item.ID, &item.MemberID, &item.AnimeID, &item.Text, &item.Score,
			&item.CreatedAt, &item.UpdatedAt, &item.Member.DisplayName)
	item.Member.ID = item.MemberID
	return item, err
}

func insertAnime(ctx context.Context, tx pgx.Tx, anime Anime) error {
	titleJSON, err := json.Marshal(anime.Title)
	if err != nil {
		return err
	}
	coverJSON, err := json.Marshal(anime.CoverImage)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO anime (id,title,cover_image,banner_image,description,average_score,popularity,episodes,status,format)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, anime.ID, titleJSON, coverJSON, anime.BannerImage,
		anime.Description, anime.AverageScore, anime.Popularity, anime.Episodes, anime.Status, anime.Format)
	return err
}

func putGenres(ctx context.Context, tx pgx.Tx, animeID int, genres []string) error {
	for i, genre := range genres {
		genre = strings.TrimSpace(genre)
		if genre == "" {
			continue
		}
		if len([]rune(genre)) > 50 {
			return ErrInvalidAnime
		}
		if _, err := tx.Exec(ctx, `INSERT INTO genres(name) VALUES($1) ON CONFLICT DO NOTHING`, genre); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO anime_genres(anime_id,genre,position) VALUES($1,$2,$3)`, animeID, genre, i); err != nil {
			return err
		}
	}
	return nil
}

func validateStoredAnime(anime Anime) error {
	if anime.ID <= 0 || anime.Popularity < 0 || anime.CoverImage.Large == "" {
		return ErrInvalidAnime
	}
	if anime.AverageScore != nil && (*anime.AverageScore < 0 || *anime.AverageScore > 100) {
		return ErrInvalidAnime
	}
	if anime.Episodes != nil && *anime.Episodes < 0 {
		return ErrInvalidAnime
	}
	if !validAnimeStatus(anime.Status) || !validAnimeFormat(anime.Format) {
		return ErrInvalidAnime
	}
	return nil
}

func validAnimeStatus(value string) bool {
	switch value {
	case "FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS":
		return true
	default:
		return false
	}
}

func validAnimeFormat(value string) bool {
	switch value {
	case "TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC":
		return true
	default:
		return false
	}
}

var _ WatchlistStore = (*PostgresStore)(nil)
var _ AnimeCacheStore = (*PostgresStore)(nil)
