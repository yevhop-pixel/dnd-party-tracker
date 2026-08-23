-- Кусок schema.sql к накатыванию в SQL Editor Supabase (2026-08-23).
-- Идемпотентен, вырезан из основного файла дословно.

-- =====================================================================
--  ЖУРНАЛ ИЗМЕНЕНИЙ — что игроки правят у себя в листе
-- =====================================================================
-- Просьба ГМа: видеть, кто что поменял — «Габен: золото было 438, стало 400»,
-- и то же по вещам. Пишем триггерами в базе, а не из клиента: правки уходят
-- из десятка разных мест (карман золота, карман защиты, быстрые списки,
-- редактор листа, кнопки ХП в шапке), и любой забытый вызов означал бы дыру
-- в журнале. Триггер пропустить нельзя.

create table if not exists change_log (
  id           bigserial primary key,
  campaign_id  uuid not null references campaign on delete cascade,
  -- Кто правил. Может быть null: правку мог сделать процесс без сессии, и
  -- терять из-за этого саму запись журнала незачем.
  actor_id     uuid references app_user on delete set null,
  sheet_id     uuid references character_sheet on delete set null,
  -- Имя персонажа копией, а не ссылкой: лист могут отвязать от кампании или
  -- переименовать, а журнал должен остаться читаемым.
  char_name    text not null default '',
  -- Что за сущность: 'sheet' — сам лист, иначе имя дочерней таблицы.
  entity       text not null,
  entity_name  text not null default '',
  action       text not null check (action in ('insert', 'update', 'delete')),
  field        text,
  old_value    text,
  new_value    text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_change_log_campaign on change_log (campaign_id, created_at desc);

alter table change_log enable row level security;

-- Журнал читает только ГМ кампании. Писать в него клиент не может вовсе:
-- политик insert/update/delete нет, всё пишут триггеры (SECURITY DEFINER).
drop policy if exists change_log_read on change_log;
create policy change_log_read on change_log for select using (is_gm(campaign_id));

-- Человеческие названия полей листа. Заодно это whitelist: чего нет в списке,
-- в журнал не попадает — иначе он утонул бы в правках заметок и сортировки.
create or replace function sheet_field_label(p_field text)
returns text language sql immutable as $fn$
  select case p_field
    when 'wallet_gold'    then 'золото в кошельке'
    when 'bank_gold'      then 'золото в банке'
    when 'debt_gold'      then 'долг'
    when 'hp_current'     then 'хиты'
    when 'hp_max'         then 'максимум хитов'
    when 'armor_class'    then 'класс доспеха'
    when 'speed'          then 'скорость'
    when 'initiative'     then 'инициатива'
    when 'char_level'     then 'уровень'
    when 'char_name'      then 'имя персонажа'
    when 'char_class'     then 'класс'
    when 'char_race'      then 'раса'
    when 'strength'       then 'сила'
    when 'dexterity'      then 'ловкость'
    when 'constitution'   then 'телосложение'
    when 'intelligence'   then 'интеллект'
    when 'wisdom'         then 'мудрость'
    when 'charisma'       then 'харизма'
    else null
  end;
$fn$;

-- Триггер листа: по строке журнала на каждое изменившееся поле из whitelist.
-- Значения достаём через to_jsonb, а не динамическим SQL: в EXECUTE тип
-- record-параметра не выводится, и обращение к его полю падает.
create or replace function log_sheet_change()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  f      text;
  ojson  jsonb := to_jsonb(old);
  njson  jsonb := to_jsonb(new);
  before text;
  after  text;
  who    text := coalesce(nullif(new.char_name, ''), new.name);
begin
  -- Лист вне кампании журналировать некуда и незачем.
  if new.campaign_id is null then
    return new;
  end if;

  foreach f in array array[
    'wallet_gold', 'bank_gold', 'debt_gold', 'hp_current', 'hp_max',
    'armor_class', 'speed', 'initiative', 'char_level', 'char_name',
    'char_class', 'char_race', 'strength', 'dexterity', 'constitution',
    'intelligence', 'wisdom', 'charisma'
  ] loop
    before := ojson ->> f;
    after := njson ->> f;
    if before is distinct from after then
      insert into change_log (campaign_id, actor_id, sheet_id, char_name, entity, action, field, old_value, new_value)
      values (new.campaign_id, auth.uid(), new.id, who, 'sheet', 'update', sheet_field_label(f), before, after);
    end if;
  end loop;

  return new;
end $fn$;

drop trigger if exists character_sheet_change_log on character_sheet;
create trigger character_sheet_change_log
  after update on character_sheet
  for each row execute function log_sheet_change();

-- Триггер дочерних таблиц (вещи, зелья, расходники, экипировка, черты,
-- квесты, NPC). Одна функция на все: у черты колонка называется title, у
-- остальных name, количество есть не везде — поэтому читаем через jsonb, а
-- не перечисляем варианты.
create or replace function log_child_change()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  rec       record;
  rj        jsonb;
  oj        jsonb;
  sheet     character_sheet%rowtype;
  who       text;
  item_name text;
  qty_before text;
  qty_after  text;
  name_before text;
begin
  if tg_op = 'DELETE' then
    rec := old;
  else
    rec := new;
  end if;
  rj := to_jsonb(rec);

  select * into sheet from character_sheet where id = (rj ->> 'character_id')::uuid;
  if not found or sheet.campaign_id is null then
    return rec;
  end if;

  who := coalesce(nullif(sheet.char_name, ''), sheet.name);
  item_name := coalesce(rj ->> 'name', rj ->> 'title', '');

  if tg_op = 'INSERT' then
    insert into change_log (campaign_id, actor_id, sheet_id, char_name, entity, entity_name, action)
    values (sheet.campaign_id, auth.uid(), sheet.id, who, tg_table_name, item_name, 'insert');
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into change_log (campaign_id, actor_id, sheet_id, char_name, entity, entity_name, action)
    values (sheet.campaign_id, auth.uid(), sheet.id, who, tg_table_name, item_name, 'delete');
    return old;
  end if;

  -- UPDATE: пишем только количество и переименование. Описания правятся
  -- посимвольно через автосохранение и залили бы журнал целиком.
  oj := to_jsonb(old);
  qty_before := oj ->> 'quantity';
  qty_after := rj ->> 'quantity';
  if qty_before is distinct from qty_after then
    insert into change_log (campaign_id, actor_id, sheet_id, char_name, entity, entity_name, action, field, old_value, new_value)
    values (sheet.campaign_id, auth.uid(), sheet.id, who, tg_table_name, item_name, 'update',
            'количество', qty_before, qty_after);
  end if;

  name_before := coalesce(oj ->> 'name', oj ->> 'title', '');
  if name_before is distinct from item_name then
    insert into change_log (campaign_id, actor_id, sheet_id, char_name, entity, entity_name, action, field, old_value, new_value)
    values (sheet.campaign_id, auth.uid(), sheet.id, who, tg_table_name, item_name, 'update',
            'название', name_before, item_name);
  end if;

  return new;
end $fn$;

do $do$ declare t text; begin
  foreach t in array array['inventory_item', 'equipped_item', 'potion', 'consumable', 'feature', 'quest', 'npc'] loop
    execute format('drop trigger if exists %1$s_change_log on %1$s;', t);
    execute format(
      'create trigger %1$s_change_log after insert or update or delete on %1$s
         for each row execute function log_child_change();', t);
  end loop;
end $do$;

-- Журнал в realtime-публикацию НЕ добавляем: payload postgres_changes не
-- проходит RLS, а в строке лежит чужое золото и чужие вещи. Панель ГМа
-- перечитывает список сама (useLiveSync).
