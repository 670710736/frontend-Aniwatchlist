package store

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrEmailTaken    = errors.New("email already registered")
	ErrInvalidMember = errors.New("invalid member details")
	ErrInvalidRole   = errors.New("role must be member or admin")
)

// Member stores AniWatchlist account data. PasswordHash is never serialized.
type Member struct {
	ID           int64      `json:"id"`
	Email        string     `json:"email"`
	DisplayName  string     `json:"displayName"`
	Role         string     `json:"role"`
	CreatedAt    *time.Time `json:"createdAt,omitempty"`
	PasswordHash string     `json:"-"`
}

// CreateMember adds an account to the process-local store. Emails are
// normalized to lowercase to match the database schema's case-insensitive
// uniqueness rule. PasswordHash must already be securely hashed by the caller.
func (s *MemoryStore) CreateMember(ctx context.Context, email, hash, name string) (Member, error) {
	if err := ctx.Err(); err != nil {
		return Member{}, err
	}

	email = strings.ToLower(strings.TrimSpace(email))
	name = strings.TrimSpace(name)
	if email == "" || hash == "" || name == "" || utf8.RuneCountInString(name) > 50 {
		return Member{}, ErrInvalidMember
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.members {
		if existing.Email == email {
			return Member{}, ErrEmailTaken
		}
	}

	now := time.Now().UTC()
	stored := Member{
		ID:           s.nextMemberID,
		Email:        email,
		DisplayName:  name,
		Role:         "member",
		PasswordHash: hash,
		CreatedAt:    &now,
	}
	s.nextMemberID++
	s.members[stored.ID] = stored

	// Registration responses do not need the admin-only createdAt field.
	created := stored
	created.CreatedAt = nil
	return created, nil
}

// MemberByEmail performs a case-insensitive lookup and includes the password
// hash for login verification. JSON serialization still omits the hash.
func (s *MemoryStore) MemberByEmail(ctx context.Context, email string) (Member, error) {
	if err := ctx.Err(); err != nil {
		return Member{}, err
	}
	email = strings.ToLower(strings.TrimSpace(email))

	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, member := range s.members {
		if member.Email == email {
			member.CreatedAt = nil
			return member, nil
		}
	}
	return Member{}, ErrNotFound
}

// MemberByID returns a public member record without the password hash.
func (s *MemoryStore) MemberByID(ctx context.Context, id int64) (Member, error) {
	if err := ctx.Err(); err != nil {
		return Member{}, err
	}
	if id <= 0 {
		return Member{}, ErrInvalidMemberID
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	member, ok := s.members[id]
	if !ok {
		return Member{}, ErrNotFound
	}
	member.PasswordHash = ""
	member.CreatedAt = cloneTime(member.CreatedAt)
	return member, nil
}

// ListMembers returns public member records, newest first, for admin views.
func (s *MemoryStore) ListMembers(ctx context.Context) ([]Member, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	members := make([]Member, 0, len(s.members))
	for _, member := range s.members {
		member.PasswordHash = ""
		member.CreatedAt = cloneTime(member.CreatedAt)
		members = append(members, member)
	}
	sort.Slice(members, func(i, j int) bool {
		if members[i].CreatedAt != nil && members[j].CreatedAt != nil && !members[i].CreatedAt.Equal(*members[j].CreatedAt) {
			return members[i].CreatedAt.After(*members[j].CreatedAt)
		}
		return members[i].ID > members[j].ID
	})
	return members, nil
}

// UpdateMemberRole changes a member's AniWatchlist role.
func (s *MemoryStore) UpdateMemberRole(ctx context.Context, id int64, role string) (Member, error) {
	if err := ctx.Err(); err != nil {
		return Member{}, err
	}
	if id <= 0 {
		return Member{}, ErrInvalidMemberID
	}
	if role != "member" && role != "admin" {
		return Member{}, ErrInvalidRole
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	member, ok := s.members[id]
	if !ok {
		return Member{}, ErrNotFound
	}
	member.Role = role
	s.members[id] = member
	member.PasswordHash = ""
	member.CreatedAt = cloneTime(member.CreatedAt)
	return member, nil
}

func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
