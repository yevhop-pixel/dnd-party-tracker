-- Кусок schema.sql к накатыванию в SQL Editor Supabase (2026-09-05).
-- Идемпотентен.

-- ---------------------------------------------------------------------
-- Слот-машина: одна на кампанию, крутят по очереди, результат видят все
-- ---------------------------------------------------------------------
-- Игрушка в духе «Премиума»: дёрнул ручку, три барабана закрутились у ВСЕХ
-- за столом одновременно, и остановились на одном и том же. Отсюда два
-- требования, которые решает база, а не клиент:
--   1. результат один на всех — его выбирает сервер в slot_pull, клиенты
--      только показывают присланные цифры;
--   2. пока барабаны крутятся, вторую ручку дёрнуть нельзя — проверка тоже
--      здесь, под advisory-замком, иначе два игрока, нажавшие в одну
--      секунду, оба «выиграли» бы право крутить.
create table if not exists slot_spin (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaign on delete cascade,
  user_id      uuid not null references app_user on delete cascade,
  -- Три барабана: индексы символов 0..7. Сами символы живут в клиенте
  -- (features/slots/symbols.ts), база знает только числа.
  reels        smallint[] not null check (cardinality(reels) = 3),
  -- Что выпало. Считается в slot_pull, чтобы все клиенты назвали одно и то
  -- же слово: none / pair / triple / jackpot (три короны) / curse (три черепа).
  outcome      text not null default 'none'
               check (outcome in ('none', 'pair', 'triple', 'jackpot', 'curse')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_slot_spin_campaign on slot_spin (campaign_id, created_at desc);

alter table slot_spin enable row level security;

drop policy if exists slot_spin_read on slot_spin;
create policy slot_spin_read on slot_spin for select using (is_member(campaign_id));
-- Вставка ТОЛЬКО через slot_pull (SECURITY DEFINER): политики insert нет
-- намеренно, иначе клиент мог бы подсунуть себе три короны.
drop policy if exists slot_spin_clear on slot_spin;
create policy slot_spin_clear on slot_spin for delete using (is_gm(campaign_id));

-- Дёрнуть ручку. Возвращает вставленную строку, чтобы дёрнувший начал
-- анимацию сразу, не дожидаясь realtime-события о собственной вставке.
create or replace function slot_pull(p_campaign uuid)
returns slot_spin language plpgsql security definer set search_path = public as $fn$
declare
  v_row      slot_spin;
  v_reels    smallint[];
  v_outcome  text;
  v_last     timestamptz;
  v_symbols  constant int := 8;
  -- Сколько автомат считается занятым после рывка: клиентская анимация
  -- длится около четырёх секунд, остальное — запас на сеть.
  v_busy     constant interval := interval '6 seconds';
begin
  if auth.uid() is null or not is_member(p_campaign) then
    raise exception 'Вы не участник этой кампании' using errcode = '42501';
  end if;
  -- Замок на кампанию до конца транзакции: два одновременных рывка
  -- выстраиваются в очередь, и второй уже увидит запись первого.
  perform pg_advisory_xact_lock(hashtext('slot_pull:' || p_campaign::text));
  select created_at into v_last
    from slot_spin
    where campaign_id = p_campaign
    order by created_at desc
    limit 1;
  if v_last is not null and v_last + v_busy > now() then
    raise exception 'Автомат занят: кто-то уже крутит' using errcode = 'P0001';
  end if;
  v_reels := array[
    floor(random() * v_symbols)::smallint,
    floor(random() * v_symbols)::smallint,
    floor(random() * v_symbols)::smallint
  ];
  if v_reels[1] = v_reels[2] and v_reels[2] = v_reels[3] then
    -- 5 — корона, 7 — череп (порядок символов см. symbols.ts).
    v_outcome := case v_reels[1] when 5 then 'jackpot' when 7 then 'curse' else 'triple' end;
  elsif v_reels[1] = v_reels[2] or v_reels[2] = v_reels[3] or v_reels[1] = v_reels[3] then
    v_outcome := 'pair';
  else
    v_outcome := 'none';
  end if;
  insert into slot_spin (campaign_id, user_id, reels, outcome)
    values (p_campaign, auth.uid(), v_reels, v_outcome)
    returning * into v_row;
  return v_row;
end $fn$;

-- Как и у ленты бросков: в базе остаются только последние 30 рывков на
-- кампанию, остальное стирает триггер.
create or replace function trim_slot_spins()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  delete from slot_spin d
  where d.campaign_id = new.campaign_id
    and d.id not in (
      select r.id
      from slot_spin r
      where r.campaign_id = new.campaign_id
      order by r.created_at desc, r.id desc
      limit 30
    );
  return null;
end $fn$;

drop trigger if exists slot_spin_trim on slot_spin;
create trigger slot_spin_trim
  after insert on slot_spin
  for each row execute function trim_slot_spins();

-- В realtime можно: в строке нет ничего, что кому-то из партии видеть
-- нельзя (в отличие от бестиария и журнала правок).
do $$ begin
  alter publication supabase_realtime add table slot_spin;
exception when duplicate_object then null;
end $$;
