-- Слот-машина: убраны корона и кубики, символов пять (0..4): мечи, щит,
-- мешок, зелье, череп. Череп переехал с 6 на 4, джекпота больше нет.
-- Рывки с короной или кубиками стираются. Накатывать ОДИН раз, после
-- 2026-10-12-slots-no-dragon.sql.
delete from slot_spin where 4 = any(reels) or 5 = any(reels);
update slot_spin set reels = array[
  case reels[1] when 6 then 4 else reels[1] end,
  case reels[2] when 6 then 4 else reels[2] end,
  case reels[3] when 6 then 4 else reels[3] end
]::smallint[];

create or replace function slot_pull(p_campaign uuid)
returns slot_spin language plpgsql security definer set search_path = public as $fn$
declare
  v_row      slot_spin;
  v_reels    smallint[];
  v_outcome  text;
  v_last     timestamptz;
  v_symbols  constant int := 5;
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
    -- 4 — череп (порядок символов см. symbols.ts).
    v_outcome := case v_reels[1] when 4 then 'curse' else 'triple' end;
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

select (select count(*) from slot_spin) as spins,
       (select coalesce(max(x), -1) from slot_spin, unnest(reels) x) as max_idx,
       (select count(*) from slot_spin where outcome = 'jackpot') as jackpots,
       (select count(*) from pg_proc where proname = 'slot_pull' and prosrc like '%:= 5;%') as fn_ok;
