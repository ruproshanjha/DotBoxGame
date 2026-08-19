-- Database Setup Script for DotBox
-- Run this in the Supabase SQL Editor

-- 1. CLEANUP (Optional, uncomment if resetting)
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user();
-- drop trigger if exists on_game_finished on public.games;
-- drop function if exists public.handle_game_finished();
-- drop function if exists public.join_matchmaking(uuid);
-- drop function if exists public.make_move(uuid, text, int, int);
-- drop table if exists public.game_moves;
-- drop table if exists public.matchmaking_queue;
-- drop table if exists public.rooms;
-- drop table if exists public.games;
-- drop table if exists public.profiles;

-- 2. CREATE TABLES

-- Profiles Table
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  rating integer default 1000 not null,
  games_played integer default 0 not null,
  games_won integer default 0 not null,
  games_lost integer default 0 not null,
  xp integer default 0 not null,
  created_at timestamptz default now() not null
);

-- Games Table
create table public.games (
  id uuid primary key default gen_random_uuid(),
  player1_id uuid not null references public.profiles(id) on delete cascade,
  player2_id uuid references public.profiles(id) on delete cascade, -- null means waiting for player (quick play) or bot
  board_size integer default 4 not null, -- 4x4 dots (3x3 boxes)
  current_player_id uuid references public.profiles(id),
  horizontal_lines jsonb default '[[false,false,false],[false,false,false],[false,false,false],[false,false,false]]'::jsonb not null,
  vertical_lines jsonb default '[[false,false,false,false],[false,false,false,false],[false,false,false,false]]'::jsonb not null,
  claimed_boxes jsonb default '[[null,null,null],[null,null,null],[null,null,null]]'::jsonb not null,
  player1_score integer default 0 not null,
  player2_score integer default 0 not null,
  status text default 'waiting' not null, -- 'waiting', 'playing', 'finished'
  winner_id uuid references public.profiles(id),
  game_mode text default 'quick' not null, -- 'quick', 'private', 'bot'
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Rooms Table (For Private Rooms)
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid references public.profiles(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  status text default 'waiting' not null, -- 'waiting', 'playing', 'completed'
  created_at timestamptz default now() not null
);

-- Matchmaking Queue Table
create table public.matchmaking_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now() not null
);

-- Game Moves Table (For game logs & replay)
create table public.game_moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  move jsonb not null, -- e.g. {"type": "horizontal", "r": 0, "c": 1}
  move_number integer not null,
  created_at timestamptz default now() not null
);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.rooms enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.game_moves enable row level security;

-- 4. CREATE RLS POLICIES

-- Profiles policies
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Games policies
create policy "Games are viewable by authenticated users"
  on public.games for select using (auth.uid() is not null);

create policy "Players or prospective Player 2 can update games"
  on public.games for update using (auth.uid() = player1_id or player2_id is null or auth.uid() = player2_id);

-- Players can insert games
create policy "Players can insert games"
  on public.games for insert with check (auth.uid() = player1_id);

-- Rooms policies
create policy "Rooms are viewable by authenticated users"
  on public.rooms for select using (auth.uid() is not null);

create policy "Host can insert room"
  on public.rooms for insert with check (auth.uid() = host_id);

create policy "Host, Guest or prospective Guest can update room"
  on public.rooms for update using (auth.uid() = host_id or guest_id is null or auth.uid() = guest_id);

-- Matchmaking Queue policies
create policy "Queue is viewable by authenticated users"
  on public.matchmaking_queue for select using (auth.uid() is not null);

create policy "Users can join queue"
  on public.matchmaking_queue for insert with check (auth.uid() = user_id);

create policy "Users can leave queue"
  on public.matchmaking_queue for delete using (auth.uid() = user_id);

-- Game Moves policies
create policy "Moves are viewable by authenticated users"
  on public.game_moves for select using (auth.uid() is not null);

create policy "Players can insert moves"
  on public.game_moves for insert with check (auth.uid() = player_id);

-- 5. AUTOMATIC PROFILE TRIGGER ON SIGN UP
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_username text;
  v_display_name text;
begin
  v_display_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_username := coalesce(new.raw_user_meta_data->>'custom_username', split_part(new.email, '@', 1) || '_' || substr(md5(random()::text), 1, 4));
  
  insert into public.profiles (id, username, display_name, avatar_url, rating, games_played, games_won, games_lost, xp)
  values (
    new.id,
    v_username,
    v_display_name,
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    1000,
    0,
    0,
    0,
    0
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. RATING AND STATS TRIGGER ON GAME FINISHED
create or replace function public.handle_game_finished()
returns trigger as $$
declare
  v_r1 int;
  v_r2 int;
  v_e1 double precision;
  v_e2 double precision;
  v_s1 double precision;
  v_s2 double precision;
  v_k int := 32;
  v_r1_new int;
  v_r2_new int;
  v_xp1_add int;
  v_xp2_add int;
begin
  -- 1. Determine XP awards
  if new.winner_id is null then
    -- Draw
    v_xp1_add := 15;
    v_xp2_add := 15;
  elsif new.winner_id = new.player1_id then
    v_xp1_add := 25;
    v_xp2_add := 10;
  else
    v_xp1_add := 10;
    v_xp2_add := 25;
  end if;

  -- Only update ratings for quick (ranked) games between two human players
  if new.game_mode <> 'quick' or new.player2_id is null then
    -- But we still update the general games_played and XP statistics for profiles!
    update public.profiles
    set games_played = games_played + 1,
        games_won = case when id = new.winner_id then games_won + 1 else games_won end,
        games_lost = case when id <> new.winner_id and new.winner_id is not null then games_lost + 1 else games_lost end,
        xp = xp + (case when id = new.player1_id then v_xp1_add else v_xp2_add end)
    where id = new.player1_id;

    if new.player2_id is not null then
      update public.profiles
      set games_played = games_played + 1,
          games_won = case when id = new.winner_id then games_won + 1 else games_won end,
          games_lost = case when id <> new.winner_id and new.winner_id is not null then games_lost + 1 else games_lost end,
          xp = xp + (case when id = new.player2_id then v_xp2_add else v_xp1_add end)
      where id = new.player2_id;
    end if;

    return new;
  end if;

  -- 1. Get current ratings
  select rating into v_r1 from public.profiles where id = new.player1_id;
  select rating into v_r2 from public.profiles where id = new.player2_id;
  
  v_r1 := coalesce(v_r1, 1000);
  v_r2 := coalesce(v_r2, 1000);

  -- 2. Expected scores (Elo formula)
  v_e1 := 1.0 / (1.0 + power(10.0, (v_r2 - v_r1)::double precision / 400.0));
  v_e2 := 1.0 / (1.0 + power(10.0, (v_r1 - v_r2)::double precision / 400.0));

  -- 3. Actual scores
  if new.winner_id = new.player1_id then
    v_s1 := 1.0;
    v_s2 := 0.0;
  elsif new.winner_id = new.player2_id then
    v_s1 := 0.0;
    v_s2 := 1.0;
  else
    v_s1 := 0.5;
    v_s2 := 0.5;
  end if;

  -- 4. New ratings
  v_r1_new := round(v_r1 + v_k * (v_s1 - v_e1));
  v_r2_new := round(v_r2 + v_k * (v_s2 - v_e2));

  -- Ensure ratings don't drop below 100
  v_r1_new := greatest(v_r1_new, 100);
  v_r2_new := greatest(v_r2_new, 100);

  -- 5. Update profiles
  update public.profiles
  set rating = v_r1_new,
      games_played = games_played + 1,
      games_won = case when id = new.winner_id then games_won + 1 else games_won end,
      games_lost = case when id <> new.winner_id and new.winner_id is not null then games_lost + 1 else games_lost end,
      xp = xp + v_xp1_add
  where id = new.player1_id;

  update public.profiles
  set rating = v_r2_new,
      games_played = games_played + 1,
      games_won = case when id = new.winner_id then games_won + 1 else games_won end,
      games_lost = case when id <> new.winner_id and new.winner_id is not null then games_lost + 1 else games_lost end,
      xp = xp + v_xp2_add
  where id = new.player2_id;

  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_game_finished
  after update of status on public.games
  for each row
  when (new.status = 'finished' and old.status = 'playing')
  execute procedure public.handle_game_finished();

-- 7. ATOMIC MATCHMAKING RPC FUNCTION
create or replace function public.join_matchmaking(p_user_id uuid)
returns json as $$
declare
  v_matched_user_id uuid;
  v_game_id uuid;
begin
  -- Clean up any existing queue entries for this user
  delete from public.matchmaking_queue where user_id = p_user_id;
  
  -- Find the oldest waiting user in queue (excluding current user)
  select user_id into v_matched_user_id
  from public.matchmaking_queue
  where user_id <> p_user_id
  order by created_at asc
  limit 1
  for update skip locked; -- prevent race conditions between concurrent players
  
  if v_matched_user_id is not null then
    -- Remove matched player from queue
    delete from public.matchmaking_queue where user_id = v_matched_user_id;
    
    -- Create game
    insert into public.games (
      player1_id,
      player2_id,
      board_size,
      current_player_id,
      status,
      game_mode,
      horizontal_lines,
      vertical_lines,
      claimed_boxes,
      player1_score,
      player2_score
    )
    values (
      v_matched_user_id,
      p_user_id,
      4, -- 4x4 grid of dots
      v_matched_user_id, -- player 1 starts first
      'playing',
      'quick',
      '[[false,false,false],[false,false,false],[false,false,false],[false,false,false]]'::jsonb,
      '[[false,false,false,false],[false,false,false,false],[false,false,false,false]]'::jsonb,
      '[[null,null,null],[null,null,null],[null,null,null]]'::jsonb,
      0,
      0
    )
    returning id into v_game_id;
    
    return json_build_object('status', 'matched', 'game_id', v_game_id);
  else
    -- Add current user to queue
    insert into public.matchmaking_queue (user_id)
    values (p_user_id);
    
    return json_build_object('status', 'waiting', 'game_id', null);
  end if;
end;
$$ language plpgsql security definer;

-- 8. MOVE VALIDATION AND EXECUTION RPC FUNCTION
create or replace function public.make_move(
  p_game_id uuid,
  p_line_type text, -- 'horizontal' or 'vertical'
  p_r integer,
  p_c integer
)
returns json as $$
declare
  v_game record;
  v_user_id uuid;
  v_horizontal jsonb;
  v_vertical jsonb;
  v_claimed jsonb;
  v_score_p1 integer;
  v_score_p2 integer;
  v_total_boxes integer;
  v_box_completed boolean;
  v_new_completed_count integer := 0;
  v_br integer;
  v_bc integer;
  v_move_number integer;
  v_winner_id uuid := null;
  v_new_status text;
  v_new_current_player uuid;
begin
  -- Get current user ID
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'Unauthorized');
  end if;

  -- Select and lock game row
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    return json_build_object('success', false, 'error', 'Game not found');
  end if;

  -- Validate turn and status
  if v_game.status <> 'playing' then
    return json_build_object('success', false, 'error', 'Game is not in playing state');
  end if;

  if v_game.current_player_id <> v_user_id then
    return json_build_object('success', false, 'error', 'Not your turn');
  end if;

  if v_game.player1_id <> v_user_id and coalesce(v_game.player2_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_user_id then
    return json_build_object('success', false, 'error', 'You are not a player in this game');
  end if;

  v_horizontal := v_game.horizontal_lines;
  v_vertical := v_game.vertical_lines;
  v_claimed := v_game.claimed_boxes;
  v_score_p1 := v_game.player1_score;
  v_score_p2 := v_game.player2_score;

  -- Apply move to grid
  if p_line_type = 'horizontal' then
    -- Check bounds (4x3 horizontal lines: 0<=r<4, 0<=c<3)
    if p_r < 0 or p_r >= 4 or p_c < 0 or p_c >= 3 then
      return json_build_object('success', false, 'error', 'Line coordinate out of bounds');
    end if;
    
    -- Check if already played
    if (v_horizontal->p_r->>p_c)::boolean = true then
      return json_build_object('success', false, 'error', 'Line already claimed');
    end if;

    v_horizontal := jsonb_set(v_horizontal, array[p_r::text, p_c::text], 'true'::jsonb);

  elsif p_line_type = 'vertical' then
    -- Check bounds (3x4 vertical lines: 0<=r<3, 0<=c<4)
    if p_r < 0 or p_r >= 3 or p_c < 0 or p_c >= 4 then
      return json_build_object('success', false, 'error', 'Line coordinate out of bounds');
    end if;
    
    -- Check if already played
    if (v_vertical->p_r->>p_c)::boolean = true then
      return json_build_object('success', false, 'error', 'Line already claimed');
    end if;

    v_vertical := jsonb_set(v_vertical, array[p_r::text, p_c::text], 'true'::jsonb);

  else
    return json_build_object('success', false, 'error', 'Invalid line type');
  end if;

  -- Scan 3x3 boxes to detect newly completed ones
  for v_br in 0..2 loop
    for v_bc in 0..2 loop
      -- Only check if this box is currently uncompleted
      if (v_claimed->v_br->>v_bc) is null or (v_claimed->v_br->>v_bc) = '' then
        -- Check if all 4 surrounding lines are now completed:
        v_box_completed := 
          coalesce((v_horizontal->v_br->>v_bc)::boolean, false) and
          coalesce((v_horizontal->(v_br+1)->>v_bc)::boolean, false) and
          coalesce((v_vertical->v_br->>v_bc)::boolean, false) and
          coalesce((v_vertical->v_br->>(v_bc+1))::boolean, false);
          
        if v_box_completed then
          v_claimed := jsonb_set(v_claimed, array[v_br::text, v_bc::text], to_jsonb(v_user_id));
          v_new_completed_count := v_new_completed_count + 1;
        end if;
      end if;
    end loop;
  end loop;

  -- Update scores and determine turn
  if v_new_completed_count > 0 then
    if v_user_id = v_game.player1_id then
      v_score_p1 := v_score_p1 + v_new_completed_count;
    else
      v_score_p2 := v_score_p2 + v_new_completed_count;
    end if;
    -- Extra turn: current player stays the same
    v_new_current_player := v_user_id;
  else
    -- Switch turn
    if v_user_id = v_game.player1_id then
      v_new_current_player := v_game.player2_id;
    else
      v_new_current_player := v_game.player1_id;
    end if;
  end if;

  -- Check if game is completed (9 boxes total)
  v_total_boxes := 0;
  for v_br in 0..2 loop
    for v_bc in 0..2 loop
      if (v_claimed->v_br->>v_bc) is not null and (v_claimed->v_br->>v_bc) <> '' then
        v_total_boxes := v_total_boxes + 1;
      end if;
    end loop;
  end loop;

  if v_total_boxes = 9 then
    v_new_status := 'finished';
    v_new_current_player := null;
    -- Determine winner
    if v_score_p1 > v_score_p2 then
      v_winner_id := v_game.player1_id;
    elsif v_score_p2 > v_score_p1 then
      v_winner_id := v_game.player2_id;
    else
      v_winner_id := null; -- Draw
    end if;
  else
    v_new_status := 'playing';
  end if;

  -- Save move inside game_moves table
  select count(*) + 1 into v_move_number from public.game_moves where game_id = p_game_id;
  insert into public.game_moves (game_id, player_id, move, move_number)
  values (
    p_game_id,
    v_user_id,
    json_build_object('type', p_line_type, 'r', p_r, 'c', p_c, 'completed_boxes', v_new_completed_count),
    v_move_number
  );

  -- Update game record
  update public.games
  set horizontal_lines = v_horizontal,
      vertical_lines = v_vertical,
      claimed_boxes = v_claimed,
      player1_score = v_score_p1,
      player2_score = v_score_p2,
      current_player_id = v_new_current_player,
      status = v_new_status,
      winner_id = v_winner_id,
      updated_at = now()
  where id = p_game_id;

  return json_build_object(
    'success', true,
    'new_completed_count', v_new_completed_count,
    'status', v_new_status,
    'winner_id', v_winner_id
  );
end;
$$ language plpgsql security definer;

-- 8.5. CLAIM FORFEIT RPC FUNCTION
create or replace function public.claim_forfeit(p_game_id uuid)
returns json as $$
declare
  v_game record;
  v_user_id uuid;
  v_winner_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'Unauthorized');
  end if;
  
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    return json_build_object('success', false, 'error', 'Game not found');
  end if;
  
  if v_game.status <> 'playing' then
    return json_build_object('success', false, 'error', 'Game is not active');
  end if;
  
  if v_game.player1_id <> v_user_id and v_game.player2_id <> v_user_id then
    return json_build_object('success', false, 'error', 'You are not a player in this game');
  end if;
  
  -- Check if game has been idle for more than 10 seconds
  if now() - v_game.updated_at < interval '10 seconds' then
    return json_build_object('success', false, 'error', 'Game is not timed out yet');
  end if;
  
  -- Determine winner (the player who did NOT timeout)
  if v_game.current_player_id = v_game.player1_id then
    v_winner_id := v_game.player2_id;
  else
    v_winner_id := v_game.player1_id;
  end if;
  
  update public.games
  set status = 'finished',
      winner_id = v_winner_id,
      current_player_id = null,
      updated_at = now()
  where id = p_game_id;
  
  return json_build_object('success', true, 'winner_id', v_winner_id);
end;
$$ language plpgsql security definer;

-- 9. ENABLE REALTIME REPLICATION FOR ACTIVE SYNCING
begin;
  -- delete any old publication configuration if existing
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.rooms;
