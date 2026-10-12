-- ---------------------------------------------------------------------
-- Броски кубиков считает сервер
-- ---------------------------------------------------------------------
-- Раньше число выбирал браузер игрока (crypto.getRandomValues) и сам
-- записывал готовый итог в dice_roll. Математика была честной, но доверие —
-- нет: любой мог из консоли вставить себе строку с final_result = 20.
-- Теперь клиент присылает только нотацию, а кубы бросает база:
--   * генератор — gen_random_bytes из pgcrypto (криптостойкий, тот же
--     источник, что у gen_random_uuid), с отбрасыванием хвоста диапазона,
--     чтобы не было смещения по модулю;
--   * формат results_text, крит и премиум-удача — один в один как было в
--     клиенте (features/dice/diceApi.ts), лента и анимации их разбирают;
--   * прямой insert в dice_roll закрывается вторым шагом
--     (2026-10-12-server-dice-lock.sql), после того как новый клиент
--     выкачен, чтобы не было окна, когда бросать нельзя вовсе.

-- Один честный кубик 1..p_sides.
create or replace function dice_fair_die(p_sides int)
returns int language plpgsql volatile set search_path = public, extensions as $fn$
declare
  -- Самое большое кратное p_sides, что меньше 2^32: всё, что выше, —
  -- «хвост», из-за которого младшие грани выпадали бы чуть чаще.
  v_limit bigint := (4294967296 / p_sides) * p_sides;
  v_n     bigint;
begin
  loop
    v_n := ('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint;
    exit when v_n < v_limit;
  end loop;
  return (v_n % p_sides)::int + 1;
end $fn$;

-- Случайное событие с вероятностью p (для премиум-удачи).
create or replace function dice_chance(p float8)
returns boolean language sql volatile set search_path = public, extensions as $fn$
  select ('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint / 4294967296.0 < p;
$fn$;

-- Разбор нотации «2d6+1d4-1». Правила и пределы те же, что у parseNotation
-- в features/dice/notation.ts: до 10 слагаемых, до 100 кубов всего, грани
-- 2..1000, модификатор по модулю до 1000. ok = false — нотация битая.
create or replace function dice_parse(
  p_notation text,
  out ok boolean,
  out signs int[],
  out counts int[],
  out sides int[],
  out modifier int
) language plpgsql immutable set search_path = public as $fn$
declare
  v_s       text := regexp_replace(coalesce(p_notation, ''), '\s+', '', 'g');
  v_rebuilt text := '';
  v_tokens  int := 0;
  v_total   int := 0;
  v_m       text[];
  v_sign    int;
  v_body    text;
  v_count   int;
  v_sides   int;
begin
  ok := false;
  signs := '{}';
  counts := '{}';
  sides := '{}';
  modifier := 0;
  if v_s = '' or length(v_s) > 200 then
    return;
  end if;
  for v_m in select regexp_matches(v_s, '([+-]?)([^+-]+)', 'g') loop
    v_tokens := v_tokens + 1;
    v_rebuilt := v_rebuilt || v_m[1] || v_m[2];
    v_sign := case when v_m[1] = '-' then -1 else 1 end;
    v_body := lower(v_m[2]);
    if v_body ~ '^\d{0,4}d\d{1,4}$' then
      v_count := coalesce(nullif(split_part(v_body, 'd', 1), '')::int, 1);
      v_sides := split_part(v_body, 'd', 2)::int;
      if v_count < 1 or v_sides < 2 or v_sides > 1000 then
        return;
      end if;
      v_total := v_total + v_count;
      if v_total > 100 then
        return;
      end if;
      signs := signs || v_sign;
      counts := counts || v_count;
      sides := sides || v_sides;
    elsif v_body ~ '^\d{1,7}$' then
      modifier := modifier + v_sign * v_body::int;
    else
      return;
    end if;
  end loop;
  -- Между найденными слагаемыми не должно быть пропусков («1d20++2»).
  if v_rebuilt <> v_s or v_tokens > 10 or cardinality(sides) = 0 or abs(modifier) > 1000 then
    return;
  end if;
  ok := true;
end $fn$;

-- Бросок разобранной нотации. detail — «14+3-2»: первое значение без «+»,
-- дальше каждый куб и модификатор со своим знаком. rolls — сырые грани всех
-- кубов по порядку (нужны для крита).
create or replace function dice_throw(
  p_signs int[],
  p_counts int[],
  p_sides int[],
  p_modifier int,
  out total int,
  out detail text,
  out rolls int[]
) language plpgsql volatile set search_path = public as $fn$
declare
  v_face  int;
  v_first boolean := true;
begin
  total := 0;
  detail := '';
  rolls := '{}';
  for i in 1 .. cardinality(p_sides) loop
    for j in 1 .. p_counts[i] loop
      v_face := dice_fair_die(p_sides[i]);
      rolls := rolls || v_face;
      total := total + p_signs[i] * v_face;
      detail := detail || case when p_signs[i] < 0 then '-' when v_first then '' else '+' end || v_face;
      v_first := false;
    end loop;
  end loop;
  if p_modifier <> 0 then
    total := total + p_modifier;
    detail := detail || case when p_modifier < 0 then '-' else '+' end || abs(p_modifier);
  end if;
end $fn$;

-- Крит только у чистого одиночного d20 (см. detectCrit в notation.ts):
-- двадцатка — успех при любом модификаторе, единица — провал только без
-- модификатора.
create or replace function dice_crit(p_signs int[], p_counts int[], p_sides int[], p_modifier int, p_rolls int[])
returns text language sql immutable set search_path = public as $fn$
  select case
    when cardinality(p_sides) <> 1 or p_signs[1] <> 1 or p_counts[1] <> 1 or p_sides[1] <> 20 then null
    when p_rolls[1] = 20 then 'success'
    when p_rolls[1] = 1 and p_modifier = 0 then 'fail'
  end;
$fn$;

-- Бросок из панели, макроса или встречный ответ. p_premium — «этот бросок
-- может получить премиум-удачу»; сработает, только если подписка у автора
-- действительно есть (app_user.is_premium), клиенту на слово не верим.
create or replace function submit_roll(
  p_campaign  uuid,
  p_character uuid,
  p_notation  text,
  p_mode      text,
  p_secret    boolean,
  p_pending   boolean,
  p_contest   uuid,
  p_premium   boolean
) returns dice_roll language plpgsql security definer set search_path = public as $fn$
declare
  v_uid     uuid := auth.uid();
  v_p       record;
  v_r1      record;
  v_r2      record;
  v_premium boolean;
  v_lucky   boolean := false;
  v_final   int;
  v_text    text;
  v_crit    text;
  v_row     dice_roll;
begin
  if v_uid is null or not is_member(p_campaign) then
    raise exception 'Вы не участник этой кампании' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('normal', 'advantage', 'disadvantage') then
    raise exception 'Неизвестный режим броска: %', p_mode using errcode = '22023';
  end if;
  if p_contest is not null
     and not exists (select 1 from dice_roll where id = p_contest and campaign_id = p_campaign) then
    raise exception 'Бросок, на который вы отвечаете, не найден' using errcode = '22023';
  end if;
  select * into v_p from dice_parse(p_notation);
  if not v_p.ok then
    raise exception 'Неверная нотация броска: «%»', p_notation using errcode = '22023';
  end if;
  v_premium := coalesce(p_premium, false)
    and coalesce((select is_premium from app_user where id = v_uid), false);

  if p_mode = 'normal' then
    select * into v_r1 from dice_throw(v_p.signs, v_p.counts, v_p.sides, v_p.modifier);
    -- Шуточная премиум-удача, только на чистом d20 (см. features/premium):
    -- единица один раз переигрывается с шансом 20%, иначе раз в десять
    -- бросков перебрасываем и берём лучший. Звёздочка в нотации говорит
    -- столу, что бросок подкручен.
    if v_premium and cardinality(v_p.sides) = 1 and v_p.signs[1] = 1
       and v_p.counts[1] = 1 and v_p.sides[1] = 20 then
      if v_r1.rolls[1] = 1 and dice_chance(0.2) then
        select * into v_r1 from dice_throw(v_p.signs, v_p.counts, v_p.sides, v_p.modifier);
        v_lucky := true;
      elsif dice_chance(0.1) then
        select * into v_r2 from dice_throw(v_p.signs, v_p.counts, v_p.sides, v_p.modifier);
        if v_r2.total > v_r1.total then
          v_r1 := v_r2;
        end if;
        v_lucky := true;
      end if;
    end if;
    v_final := v_r1.total;
    v_text := v_r1.detail;
    v_crit := dice_crit(v_p.signs, v_p.counts, v_p.sides, v_p.modifier, v_r1.rolls);
  else
    -- Преимущество/помеха: нотация бросается дважды, берётся больший или
    -- меньший итог. Крит — по броску, что пошёл в итог.
    select * into v_r1 from dice_throw(v_p.signs, v_p.counts, v_p.sides, v_p.modifier);
    select * into v_r2 from dice_throw(v_p.signs, v_p.counts, v_p.sides, v_p.modifier);
    v_final := case when p_mode = 'advantage' then greatest(v_r1.total, v_r2.total)
                    else least(v_r1.total, v_r2.total) end;
    v_text := format('%s (%s) | %s (%s) → %s', v_r1.total, v_r1.detail, v_r2.total, v_r2.detail, v_final);
    v_crit := dice_crit(v_p.signs, v_p.counts, v_p.sides, v_p.modifier,
                        case when v_r1.total = v_final then v_r1.rolls else v_r2.rolls end);
  end if;

  insert into dice_roll (campaign_id, user_id, character_id, notation, roll_mode, results_text,
                         final_result, is_secret, crit, contest_roll_id, is_pending, is_premium)
    values (p_campaign, v_uid, p_character,
            case when v_lucky then p_notation || ' ✨' else p_notation end,
            p_mode, v_text, v_final, coalesce(p_secret, false), v_crit, p_contest,
            coalesce(p_pending, false), v_premium)
    returning * into v_row;
  return v_row;
end $fn$;

-- Проверка характеристики или инициатива с листа: 1d20 + модификатор с
-- подписью («СИЛ (1d20+2)»). Без премиум-удачи и не тайная — как и было.
create or replace function submit_check_roll(
  p_campaign  uuid,
  p_character uuid,
  p_label     text,
  p_modifier  int
) returns dice_roll language plpgsql security definer set search_path = public as $fn$
declare
  v_uid  uuid := auth.uid();
  v_r    record;
  v_row  dice_roll;
begin
  if v_uid is null or not is_member(p_campaign) then
    raise exception 'Вы не участник этой кампании' using errcode = '42501';
  end if;
  if abs(coalesce(p_modifier, 0)) > 1000 or length(coalesce(p_label, '')) > 100 then
    raise exception 'Неверная проверка' using errcode = '22023';
  end if;
  select * into v_r from dice_throw(array[1], array[1], array[20], coalesce(p_modifier, 0));
  insert into dice_roll (campaign_id, user_id, character_id, notation, roll_mode, results_text,
                         final_result, is_secret, crit)
    values (p_campaign, v_uid, p_character,
            format('%s (1d20%s)', p_label, case when p_modifier >= 0 then '+' || p_modifier else p_modifier::text end),
            'normal', v_r.detail, v_r.total, false,
            dice_crit(array[1], array[1], array[20], coalesce(p_modifier, 0), v_r.rolls))
    returning * into v_row;
  return v_row;
end $fn$;

-- Вызывать снаружи можно только два входа, и только вошедшим.
revoke execute on function dice_fair_die(int) from public, anon, authenticated;
revoke execute on function dice_chance(float8) from public, anon, authenticated;
revoke execute on function dice_parse(text) from public, anon, authenticated;
revoke execute on function dice_throw(int[], int[], int[], int) from public, anon, authenticated;
revoke execute on function dice_crit(int[], int[], int[], int, int[]) from public, anon, authenticated;
revoke execute on function submit_roll(uuid, uuid, text, text, boolean, boolean, uuid, boolean) from public, anon;
revoke execute on function submit_check_roll(uuid, uuid, text, int) from public, anon;
grant execute on function submit_roll(uuid, uuid, text, text, boolean, boolean, uuid, boolean) to authenticated;
grant execute on function submit_check_roll(uuid, uuid, text, int) to authenticated;
