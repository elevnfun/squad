-- $ELEVN database schema (Postgres 17). Phases 2-3: data, scoring, squads and game logic.
-- Settlement, payouts and holdings tables come in Phases 5-6.
-- Re-runnable: every object is created only if missing.

-- ------------------------------------------------------------- reference ---
CREATE TABLE IF NOT EXISTS leagues (
    id          integer PRIMARY KEY,               -- API-Football league id (39, 140, 78, ...)
    slug        text NOT NULL UNIQUE,              -- premier-league, la-liga, ...
    phase       text NOT NULL                      -- launch / later
);

CREATE TABLE IF NOT EXISTS clubs (
    id          integer PRIMARY KEY,               -- API-Football team id
    name        text NOT NULL,
    logo        text
);

CREATE TABLE IF NOT EXISTS players (
    id          integer PRIMARY KEY,               -- API-Football player id
    name        text NOT NULL,
    position    text CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
    club_id     integer REFERENCES clubs (id),
    league_id   integer REFERENCES leagues (id),   -- league area the player belongs to now
    birth_date  date,
    photo       text,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------- rounds/fixtures ---
CREATE TABLE IF NOT EXISTS gameweeks (
    id            serial PRIMARY KEY,
    league_id     integer NOT NULL REFERENCES leagues (id),
    season        integer NOT NULL,                -- 2026 = 2026/27
    round         text NOT NULL,                   -- API-Football round, e.g. "Regular Season - 9"
    number        integer,                         -- 9
    first_kickoff timestamptz,                     -- lock time
    last_kickoff  timestamptz,
    settles_at    timestamptz,                     -- last match end + settlement delay
    state         text NOT NULL DEFAULT 'open'
                  CHECK (state IN ('open', 'locked', 'live', 'settling', 'settled')),
    UNIQUE (league_id, season, round)
);

CREATE TABLE IF NOT EXISTS fixtures (
    id           integer PRIMARY KEY,              -- API-Football fixture id
    league_id    integer NOT NULL REFERENCES leagues (id),
    season       integer NOT NULL,
    round        text NOT NULL,
    gameweek_id  integer REFERENCES gameweeks (id),
    kickoff      timestamptz NOT NULL,
    status       text NOT NULL,                    -- NS, 1H, HT, 2H, ET, P, FT, AET, PEN, PST, CANC, ...
    elapsed      integer,
    home_club_id integer NOT NULL REFERENCES clubs (id),
    away_club_id integer NOT NULL REFERENCES clubs (id),
    home_goals   integer,
    away_goals   integer,
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fixtures_gameweek ON fixtures (gameweek_id);
CREATE INDEX IF NOT EXISTS fixtures_kickoff ON fixtures (kickoff);

-- every API response we store, so scores can be re-derived and audited
CREATE TABLE IF NOT EXISTS api_responses (
    id          bigserial PRIMARY KEY,
    endpoint    text NOT NULL,
    params      jsonb NOT NULL,
    fetched_at  timestamptz NOT NULL DEFAULT now(),
    body        jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS api_responses_endpoint ON api_responses (endpoint, fetched_at);

-- --------------------------------------------------------- stats & scores ---
CREATE TABLE IF NOT EXISTS player_match_stats (
    fixture_id      integer NOT NULL REFERENCES fixtures (id),
    player_id       integer NOT NULL REFERENCES players (id),
    club_id         integer NOT NULL REFERENCES clubs (id),
    position        text NOT NULL,
    minutes         integer NOT NULL DEFAULT 0,
    goals           integer NOT NULL DEFAULT 0,
    assists         integer NOT NULL DEFAULT 0,
    conceded        integer NOT NULL DEFAULT 0,
    saves           integer NOT NULL DEFAULT 0,
    pen_saved       integer NOT NULL DEFAULT 0,
    pen_missed      integer NOT NULL DEFAULT 0,
    yellow          integer NOT NULL DEFAULT 0,
    red             integer NOT NULL DEFAULT 0,
    own_goals       integer NOT NULL DEFAULT 0,
    accurate_passes integer NOT NULL DEFAULT 0,
    key_passes      integer NOT NULL DEFAULT 0,
    shots_on        integer NOT NULL DEFAULT 0,
    tackles         integer NOT NULL DEFAULT 0,
    duels_won       integer NOT NULL DEFAULT 0,
    rating          numeric(4, 2) NOT NULL DEFAULT 0,
    substitute      boolean NOT NULL DEFAULT false,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fixture_id, player_id)
);

-- points before Rising Stars / captain multipliers (those depend on the squad)
CREATE TABLE IF NOT EXISTS player_match_scores (
    fixture_id   integer NOT NULL,
    player_id    integer NOT NULL,
    core_plus    numeric(6, 2) NOT NULL,
    core_minus   numeric(6, 2) NOT NULL,
    involvement  numeric(6, 2) NOT NULL,
    base         numeric(6, 2) NOT NULL,
    breakdown    jsonb NOT NULL,                   -- [["goals", 10], ["involvement", 2.4], ...]
    is_final     boolean NOT NULL DEFAULT false,   -- true after the settlement re-pull
    scored_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fixture_id, player_id),
    FOREIGN KEY (fixture_id, player_id) REFERENCES player_match_stats (fixture_id, player_id)
);

-- ------------------------------------------------------------ rising stars ---
CREATE TABLE IF NOT EXISTS rising_stars (
    player_id    integer NOT NULL REFERENCES players (id),
    season       integer NOT NULL,
    league_id    integer NOT NULL REFERENCES leagues (id),
    level        integer NOT NULL DEFAULT 1,       -- current level, persists for the season
    active_from  date NOT NULL,                    -- chosen at season start, refreshed monthly
    active_to    date,
    PRIMARY KEY (player_id, season)
);

-- level used for each match, so a squad's bonus can be recomputed exactly
CREATE TABLE IF NOT EXISTS rising_star_matches (
    player_id    integer NOT NULL,
    season       integer NOT NULL,
    fixture_id   integer NOT NULL REFERENCES fixtures (id),
    level_before integer NOT NULL,
    level_after  integer NOT NULL,
    PRIMARY KEY (player_id, fixture_id),
    FOREIGN KEY (player_id, season) REFERENCES rising_stars (player_id, season)
);

-- ----------------------------------------------------------------- prices ---
CREATE TABLE IF NOT EXISTS player_prices (
    player_id    integer NOT NULL REFERENCES players (id),
    gameweek_id  integer NOT NULL REFERENCES gameweeks (id),
    price        numeric(4, 1) NOT NULL,
    source       text NOT NULL,                    -- model / default / weekly
    PRIMARY KEY (player_id, gameweek_id)
);

-- ----------------------------------------------------------------- squads ---
CREATE TABLE IF NOT EXISTS squads (
    id          serial PRIMARY KEY,
    wallet      text NOT NULL,                     -- Solana address
    league_id   integer NOT NULL REFERENCES leagues (id),   -- one league per squad
    season      integer NOT NULL,
    slot        integer NOT NULL DEFAULT 1,        -- one squad per 150k held in the area
    name        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (wallet, league_id, season, slot)
);

-- unrestricted work in progress: any players, any cost; never scored
CREATE TABLE IF NOT EXISTS squad_drafts (
    squad_id    integer PRIMARY KEY REFERENCES squads (id),
    picks       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- the saved (validated) squad for a gameweek; frozen at lock
CREATE TABLE IF NOT EXISTS squad_picks (
    squad_id     integer NOT NULL REFERENCES squads (id),
    gameweek_id  integer NOT NULL REFERENCES gameweeks (id),
    player_id    integer NOT NULL REFERENCES players (id),
    slot         integer NOT NULL CHECK (slot BETWEEN 1 AND 15),   -- 1-11 XI, 12-15 bench order (12 = GK)
    is_captain   boolean NOT NULL DEFAULT false,
    is_vice      boolean NOT NULL DEFAULT false,
    price        numeric(4, 1) NOT NULL,           -- player's price when saved
    saved_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (squad_id, gameweek_id, player_id),
    UNIQUE (squad_id, gameweek_id, slot)
);

CREATE TABLE IF NOT EXISTS transfers (
    id           bigserial PRIMARY KEY,
    squad_id     integer NOT NULL REFERENCES squads (id),
    gameweek_id  integer NOT NULL REFERENCES gameweeks (id),
    player_out   integer NOT NULL REFERENCES players (id),
    player_in    integer NOT NULL REFERENCES players (id),
    kind         text NOT NULL CHECK (kind IN ('free', 'replacement', 'extra')),
    penalty      integer NOT NULL DEFAULT 0,       -- -8 for an extra transfer
    made_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS squad_gameweek_scores (
    squad_id     integer NOT NULL REFERENCES squads (id),
    gameweek_id  integer NOT NULL REFERENCES gameweeks (id),
    points       numeric(7, 2) NOT NULL,           -- after multipliers and transfer penalties
    transfer_penalty integer NOT NULL DEFAULT 0,
    captain_used integer,
    auto_subs    jsonb NOT NULL DEFAULT '[]',
    players      jsonb NOT NULL DEFAULT '{}',      -- player_id -> points counted
    is_final     boolean NOT NULL DEFAULT false,
    scored_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (squad_id, gameweek_id)
);

-- -------------------------------------------------------------- game logic ---
-- injured / suspended / doubtful players for a gameweek (API-Football /injuries), and
-- players who left the league; drives the free replacement transfer
CREATE TABLE IF NOT EXISTS player_availability (
    gameweek_id  integer NOT NULL REFERENCES gameweeks (id),
    player_id    integer NOT NULL REFERENCES players (id),
    status       text NOT NULL CHECK (status IN ('injured', 'suspended', 'doubtful', 'left_league', 'off_season')),
    reason       text,
    checked_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (gameweek_id, player_id)
);

-- the next transfer window opens 1 h after this gameweek's last match ends
ALTER TABLE gameweeks ADD COLUMN IF NOT EXISTS window_opens_at timestamptz;

-- a squad's money: bank = team value - squad cost at save; team value = previous bank +
-- what last week's players sell for now (current prices, profit included)
CREATE TABLE IF NOT EXISTS squad_banks (
    squad_id     integer NOT NULL REFERENCES squads (id),
    gameweek_id  integer NOT NULL REFERENCES gameweeks (id),
    team_value   numeric(5, 1) NOT NULL,
    bank         numeric(5, 1) NOT NULL CHECK (bank >= 0),
    PRIMARY KEY (squad_id, gameweek_id)
);

-- one-time sign-in requests: a wallet proves ownership by signing one
CREATE TABLE IF NOT EXISTS auth_nonces (
    nonce       text PRIMARY KEY,
    wallet      text,                  -- unknown until signed when the wallet connects and signs at once
    origin      text,                  -- the site that asked; the signed message must name it
    expires_at  timestamptz NOT NULL
);
ALTER TABLE auth_nonces ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE auth_nonces ALTER COLUMN wallet DROP NOT NULL;
ALTER TABLE auth_nonces DROP COLUMN IF EXISTS message;

-- every state change, with when it happened and what it did
CREATE TABLE IF NOT EXISTS gameweek_events (
    id           bigserial PRIMARY KEY,
    gameweek_id  integer NOT NULL REFERENCES gameweeks (id),
    from_state   text NOT NULL,
    to_state     text NOT NULL,
    at           timestamptz NOT NULL,
    detail       jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS transfers_squad_gameweek ON transfers (squad_id, gameweek_id);

-- ------------------------------------------------------- holdings (Phase 5) ---
-- live $ELEVN balance per wallet, kept current by the watcher (squad/watcher.py)
CREATE TABLE IF NOT EXISTS wallet_holdings (
    wallet      text PRIMARY KEY,
    balance     numeric(20, 6) NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- a squad its wallet no longer pays for: no points from frozen_at, no prize that gameweek,
-- and buying back does not undo it (it plays again from the next lock if the wallet holds enough)
CREATE TABLE IF NOT EXISTS squad_freezes (
    squad_id     integer NOT NULL REFERENCES squads (id),
    gameweek_id  integer NOT NULL REFERENCES gameweeks (id),
    frozen_at    timestamptz NOT NULL,
    balance      numeric(20, 6) NOT NULL,          -- wallet balance that caused it
    PRIMARY KEY (squad_id, gameweek_id)
);

-- --------------------------------------------------- fees and payouts (Phase 5) ---
-- all fees sit in one wallet; these buckets say what each lamport is for:
-- pot:<league_id> (prize money per area), pot:unassigned, owed (prizes awarded, not yet sent),
-- buyback, reserve, operations
CREATE TABLE IF NOT EXISTS fee_buckets (
    bucket    text PRIMARY KEY,
    lamports  bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fee_events (
    id        bigserial PRIMARY KEY,
    at        timestamptz NOT NULL DEFAULT now(),
    bucket    text NOT NULL,
    delta     bigint NOT NULL,
    reason    text NOT NULL,                    -- income, allocation, prize, topup, paid, return, ...
    ref       text
);
-- what the fee wallet should hold; anything above it is new fee income
CREATE TABLE IF NOT EXISTS fee_state (
    id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
    accounted_lamports  bigint NOT NULL DEFAULT 0,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prizes (
    id            serial PRIMARY KEY,
    gameweek_id   integer NOT NULL REFERENCES gameweeks (id),
    squad_id      integer NOT NULL REFERENCES squads (id),
    wallet        text NOT NULL,
    place         integer NOT NULL,
    lamports      bigint NOT NULL,
    instant       bigint NOT NULL,              -- 30%, sent in the next batch
    vest          bigint NOT NULL,              -- 70%, sent in 14 daily parts while holding
    instant_paid  boolean NOT NULL DEFAULT false,
    parts_paid    integer NOT NULL DEFAULT 0,
    vest_paid     bigint NOT NULL DEFAULT 0,
    last_part_at  timestamptz,
    below_since   timestamptz,                  -- first batch that found the wallet under the requirement
    returned      bigint NOT NULL DEFAULT 0,    -- unpaid vesting sent back to the pot after 90 days
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (gameweek_id, wallet)                -- one prize per wallet per contest
);

CREATE TABLE IF NOT EXISTS payout_batches (
    id          serial PRIMARY KEY,
    created_at  timestamptz NOT NULL DEFAULT now(),
    status      text NOT NULL DEFAULT 'prepared'
                CHECK (status IN ('prepared', 'done', 'partial', 'cancelled')),
    summary     jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS payout_items (
    id         serial PRIMARY KEY,
    batch_id   integer NOT NULL REFERENCES payout_batches (id),
    kind       text NOT NULL CHECK (kind IN ('instant', 'vest', 'buyback', 'burn', 'operations')),
    wallet     text,                            -- recipient (SOL transfers)
    lamports   bigint NOT NULL DEFAULT 0,
    tokens     bigint NOT NULL DEFAULT 0,       -- burn amount (raw units)
    prize_id   integer REFERENCES prizes (id),
    status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'skipped')),
    signature  text,
    note       text
);
-- the exact transactions offered for signing; a signed one must match its message
CREATE TABLE IF NOT EXISTS payout_txs (
    batch_id   integer NOT NULL REFERENCES payout_batches (id),
    idx        integer NOT NULL,
    message    text NOT NULL,                   -- base64 of the message the owner signs
    item_ids   integer[] NOT NULL,
    signature  text,
    status     text NOT NULL DEFAULT 'built',
    PRIMARY KEY (batch_id, idx)
);

-- the devnet test season's faucet (squad/faucet.py): free test tokens, once per wallet
CREATE TABLE IF NOT EXISTS faucet_claims (
    wallet      text PRIMARY KEY,
    ip          text NOT NULL,                  -- the connection it came from, for the per-day limit
    amount      bigint NOT NULL,                -- whole test tokens
    signature   text,                           -- null while the transaction is being sent
    claimed_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS faucet_claims_ip ON faucet_claims (ip, claimed_at);

-- usernames (squad/profiles.py): one per wallet, unique regardless of case; the wallet's chat standing
CREATE TABLE IF NOT EXISTS profiles (
    wallet            text PRIMARY KEY,
    username          text NOT NULL,                -- as typed
    username_key      text NOT NULL UNIQUE,         -- lower(username): the uniqueness rule
    changed_at        timestamptz NOT NULL,         -- the next change is allowed a week later
    chat_muted_until  timestamptz,
    chat_banned       boolean NOT NULL DEFAULT false
);
-- a name given up stays locked to its old owner for a week
CREATE TABLE IF NOT EXISTS username_holds (
    username_key  text PRIMARY KEY,
    wallet        text NOT NULL,
    until         timestamptz NOT NULL
);

-- the community chat (squad/chat.py): one room
CREATE TABLE IF NOT EXISTS chat_messages (
    id          bigserial PRIMARY KEY,
    wallet      text NOT NULL,
    body        text NOT NULL,                      -- plain text, shown as typed
    ip_hash     text NOT NULL,                      -- keyed hash of the connection, for the rate limit only
    created_at  timestamptz NOT NULL,
    hidden_at   timestamptz,
    hidden_by   text CHECK (hidden_by IN ('author', 'admin', 'reports', 'ban'))
);
-- the admin restored it after reports hid it: further reports no longer hide it
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS restored_at timestamptz;
CREATE INDEX IF NOT EXISTS chat_messages_wallet ON chat_messages (wallet, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_ip ON chat_messages (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_hidden ON chat_messages (hidden_at) WHERE hidden_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS chat_reports (
    message_id  bigint NOT NULL REFERENCES chat_messages (id),
    wallet      text NOT NULL,
    created_at  timestamptz NOT NULL,
    PRIMARY KEY (message_id, wallet)                -- one report per player per message
);

-- ------------------------------------------- elevn 2.0: contests, entries, winnings ---

-- one row per Blitz matchday, per Blitz week and per Draft week
CREATE TABLE IF NOT EXISTS contests (
    id                  serial PRIMARY KEY,
    kind                text NOT NULL CHECK (kind IN ('blitz_matchday', 'blitz_week', 'draft_week')),
    day                 date,                       -- the UK date of a matchday; NULL for the weekly kinds
    week_start          date NOT NULL,              -- the Tuesday the week starts
    opens_at            timestamptz,
    locks_at            timestamptz,                -- Draft: Friday's first kickoff; NULL for Blitz (squads lock per fixture)
    last_match_ends_at  timestamptz,
    final_at            timestamptz,                -- last match end + 15 minutes
    state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'live', 'review', 'final', 'rolled')),
    pot_lamports        bigint NOT NULL DEFAULT 0 CHECK (pot_lamports >= 0),
    released_at         timestamptz,
    released_by         text,                       -- 'auto' or the admin wallet
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'blitz_matchday') = (day IS NOT NULL))
);
-- one matchday contest per day, one Blitz week and one Draft week per week
CREATE UNIQUE INDEX IF NOT EXISTS contests_matchday_day ON contests (day) WHERE kind = 'blitz_matchday';
CREATE UNIQUE INDEX IF NOT EXISTS contests_blitz_week ON contests (week_start) WHERE kind = 'blitz_week';
CREATE UNIQUE INDEX IF NOT EXISTS contests_draft_week ON contests (week_start) WHERE kind = 'draft_week';

-- a wallet's saved squad (Blitz) or team (Draft) in a contest
CREATE TABLE IF NOT EXISTS entries (
    id          serial PRIMARY KEY,
    contest_id  integer NOT NULL REFERENCES contests (id),
    wallet      text NOT NULL,
    slot        integer NOT NULL DEFAULT 1 CHECK (slot BETWEEN 1 AND 3),   -- Blitz squad number; always 1 for Draft
    fixture_id  integer REFERENCES fixtures (id),   -- Blitz: the fixture the squad is on; NULL for Draft
    captain_id  integer NOT NULL REFERENCES players (id),
    locked_at   timestamptz,                        -- set when it locks
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (contest_id, wallet, slot)
);
-- a wallet's three Blitz squads are on three different fixtures
CREATE UNIQUE INDEX IF NOT EXISTS entries_wallet_fixture ON entries (contest_id, wallet, fixture_id)
    WHERE fixture_id IS NOT NULL;

-- the players in an entry
CREATE TABLE IF NOT EXISTS entry_players (
    entry_id    integer NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
    player_id   integer NOT NULL REFERENCES players (id),
    PRIMARY KEY (entry_id, player_id)
);

-- the 15 players dealt to a wallet for a Draft week
CREATE TABLE IF NOT EXISTS draft_packs (
    contest_id  integer NOT NULL REFERENCES contests (id),
    wallet      text NOT NULL,
    pack        integer NOT NULL CHECK (pack BETWEEN 1 AND 5),
    tier        text NOT NULL CHECK (tier IN ('top', 'mid', 'budget')),
    player_id   integer NOT NULL REFERENCES players (id),
    value       numeric(5,1) NOT NULL,              -- the player's value when dealt; the swap rule uses it
    opened_at   timestamptz,                        -- NULL while the pack is sealed
    PRIMARY KEY (contest_id, wallet, pack, tier),
    UNIQUE (contest_id, wallet, player_id)
);

-- points of one entry
CREATE TABLE IF NOT EXISTS entry_scores (
    entry_id        integer PRIMARY KEY REFERENCES entries (id) ON DELETE CASCADE,
    points          numeric(7,2) NOT NULL,
    captain_points  numeric(7,2) NOT NULL DEFAULT 0,
    players         jsonb NOT NULL DEFAULT '{}',    -- player_id -> points counted
    banked_at       timestamptz,                    -- Blitz: when the squad's points became final
    is_final        boolean NOT NULL DEFAULT false,
    scored_at       timestamptz NOT NULL DEFAULT now()
);

-- a wallet's line on a contest's board
CREATE TABLE IF NOT EXISTS results (
    contest_id      integer NOT NULL REFERENCES contests (id),
    wallet          text NOT NULL,
    points          numeric(8,2) NOT NULL,
    captain_points  numeric(8,2) NOT NULL DEFAULT 0,
    place           integer,                        -- NULL until ranked
    prize_lamports  bigint NOT NULL DEFAULT 0 CHECK (prize_lamports >= 0),
    is_final        boolean NOT NULL DEFAULT false,
    PRIMARY KEY (contest_id, wallet)
);
CREATE INDEX IF NOT EXISTS results_board ON results (contest_id, points DESC);

-- one row per wallet: what it can collect now and what is locked
CREATE TABLE IF NOT EXISTS winnings (
    wallet             text PRIMARY KEY,
    ready_lamports     bigint NOT NULL DEFAULT 0 CHECK (ready_lamports >= 0),   -- collectable now
    locked_lamports    bigint NOT NULL DEFAULT 0 CHECK (locked_lamports >= 0),
    first_collect_at   timestamptz,
    next_withdraw_at   timestamptz,                 -- when the next 20% withdrawal opens; NULL before the first collect
    frozen_at          timestamptz,                 -- set while the wallet holds under the freeze requirement; the timer is pushed back by the frozen time when it clears
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- every change to a wallet's winnings, so balances can be rebuilt
CREATE TABLE IF NOT EXISTS winnings_events (
    id             bigserial PRIMARY KEY,
    wallet         text NOT NULL,
    kind           text NOT NULL CHECK (kind IN ('credit', 'collect', 'withdraw')),
    ready_delta    bigint NOT NULL DEFAULT 0,
    locked_delta   bigint NOT NULL DEFAULT 0,
    contest_id     integer REFERENCES contests (id),   -- for a credit
    signature      text,                               -- the Solana transaction, for collect and withdraw
    status         text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'failed')),
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS winnings_events_wallet ON winnings_events (wallet, created_at);
-- a prize is credited once
CREATE UNIQUE INDEX IF NOT EXISTS winnings_events_credit ON winnings_events (contest_id, wallet) WHERE kind = 'credit';
