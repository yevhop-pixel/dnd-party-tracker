-- =====================================================================
--  DnD Tracker — схема базы для веб-версии
--  Postgres / Supabase.  Выполнять в SQL Editor проекта Supabase.
--
--  Модель прав:
--    * игрок  — видит и правит только свои листы; видит броски и карты
--               своей кампании; переписывается только с ГМом;
--    * ГМ     — видит все листы всех игроков своей кампании (только чтение),
--               управляет картами, видит все броски, пишет любому игроку.
--
--  Всё разграничение — на Row Level Security, а не в коде клиента:
--  клиент веб-приложения ходит в базу напрямую с anon-ключом, поэтому
--  единственная настоящая граница безопасности живёт здесь.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Пользователи
-- ---------------------------------------------------------------------
-- Supabase держит учётки в auth.users. Здесь — только публичный профиль.
create table if not exists app_user (
  id           uuid primary key references auth.users on delete cascade,
  display_name text        not null default '',
  created_at   timestamptz not null default now()
);

-- Строка в app_user заводится автоматически при регистрации.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into app_user (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Кампании и участники
-- ---------------------------------------------------------------------
create table if not exists campaign (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  join_code  text        not null unique,   -- код, по которому игрок входит в кампанию
  gm_id      uuid        not null references app_user on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists campaign_member (
  campaign_id uuid        not null references campaign on delete cascade,
  user_id     uuid        not null references app_user on delete cascade,
  role        text        not null check (role in ('gm', 'player')),
  joined_at   timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index if not exists idx_member_user on campaign_member (user_id);

-- Хелперы для политик. SECURITY DEFINER — иначе политика на campaign_member
-- рекурсивно вызовет сама себя при проверке.
create or replace function is_member(c_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from campaign_member
    where campaign_id = c_id and user_id = auth.uid()
  );
$$;

create or replace function is_gm(c_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from campaign_member
    where campaign_id = c_id and user_id = auth.uid() and role = 'gm'
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Лист персонажа  (бывшая таблица profiles из Android-версии)
-- ---------------------------------------------------------------------
create table if not exists character_sheet (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references app_user on delete cascade,
  campaign_id         uuid references campaign on delete set null,

  name                text not null,            -- имя листа в списке
  char_name           text not null default '',
  char_class          text not null default '',
  char_race           text not null default '',
  char_level          int  not null default 1,
  char_alignment      text not null default '',

  wallet_gold         int  not null default 0,
  bank_gold           int  not null default 0,
  debt_gold           int  not null default 0,
  other_currency_note text not null default '',

  armor_class         int  not null default 10,
  speed               int  not null default 30,
  initiative          int  not null default 0,
  hp_current          int  not null default 10,
  hp_max              int  not null default 10,

  strength            int  not null default 10,
  dexterity           int  not null default 10,
  constitution        int  not null default 10,
  intelligence        int  not null default 10,
  wisdom              int  not null default 10,
  charisma            int  not null default 10,

  campaign_notes      text not null default '',
  -- аватарка: ключ файла в бакете avatars (<owner_id>/<uuid>.<ext>)
  avatar_path         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_sheet_owner    on character_sheet (owner_id);
create index if not exists idx_sheet_campaign on character_sheet (campaign_id);

-- updated_at выставляется базой, а не клиентом — клиент не может его подделать.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sheet_set_updated_at on character_sheet;
create trigger sheet_set_updated_at
  before update on character_sheet
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Содержимое листа — вкладки Android-версии один в один
-- ---------------------------------------------------------------------
create table if not exists feature (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references character_sheet on delete cascade,
  title        text not null,
  description  text not null default '',
  sort_order   int  not null default 0
);

create table if not exists inventory_item (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references character_sheet on delete cascade,
  name         text not null,
  quantity     int  not null default 1,
  weight       numeric(10,2) not null default 0,
  value        int  not null default 0,
  notes        text not null default '',
  sort_order   int  not null default 0
);

create table if not exists equipped_item (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references character_sheet on delete cascade,
  slot         text not null,   -- Оружие 1/2, Доспех, Щит, Кольцо 1/2, Амулет, Шлем, Плащ, Перчатки, Сапоги
  name         text not null,
  notes        text not null default '',
  sort_order   int  not null default 0
);

create table if not exists npc (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references character_sheet on delete cascade,
  name         text not null,
  role         text not null default '',
  faction      text not null default '',
  location     text not null default '',
  relationship text not null default 'Дружел.',
  tags         text not null default '',
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

create table if not exists quest (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references character_sheet on delete cascade,
  name         text not null,
  type         text not null default '',
  description  text not null default '',
  status       text not null default 'Активный',
  created_at   timestamptz not null default now()
);

create table if not exists potion (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references character_sheet on delete cascade,
  name         text not null,
  quantity     int  not null default 1,
  description  text not null default '',
  sort_order   int  not null default 0
);

create table if not exists consumable (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references character_sheet on delete cascade,
  name         text not null,
  quantity     int  not null default 1,
  description  text not null default '',
  sort_order   int  not null default 0
);

-- Макросы бросков персонажа: сохранённые кнопки «Атака мечом 1d20+7».
create table if not exists character_macro (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references character_sheet on delete cascade,
  label        text not null,
  notation     text not null,
  sort_order   int  not null default 0
);

-- ---------------------------------------------------------------------
-- 5. Броски кубов — общая лента кампании
--    Требование: ГМ видит все броски, и игроки видят броски друг друга.
-- ---------------------------------------------------------------------
create table if not exists dice_roll (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaign on delete cascade,
  user_id       uuid not null references app_user on delete cascade,
  character_id  uuid references character_sheet on delete set null,
  notation      text not null,             -- "1d20+5"
  roll_mode     text not null default 'normal'
                 check (roll_mode in ('normal', 'advantage', 'disadvantage')),
  results_text  text not null default '',  -- детализация: "14+5"
  final_result  int  not null,
  -- бросок «в тайную»: виден только автору и ГМу
  is_secret     boolean not null default false,
  -- критический бросок чистого d20: success (натуральная 20) / fail (натуральная 1)
  crit          text check (crit in ('success', 'fail')),
  -- встречный бросок: ссылка на бросок, которому этот отвечает («противовес»);
  -- в ленте такая пара отображается одной ячейкой «кто больше»
  contest_roll_id uuid references dice_roll (id) on delete set null,
  -- саспенс: бросок сделан, но результат скрыт — в ленте у всех крутится
  -- гранник, пока автор не нажмёт «Стоп» или пока не прилетит ответка
  is_pending    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_roll_campaign on dice_roll (campaign_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Карты локаций — заводит и переключает ГМ
-- ---------------------------------------------------------------------
create table if not exists game_map (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaign on delete cascade,
  location_name text not null,             -- «Таверна», «Подземелье, 2 уровень»
  storage_path  text not null,             -- ключ файла в Supabase Storage
  -- карта, открытая игрокам прямо сейчас; ГМ видит все свои карты всегда
  is_revealed   boolean not null default false,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_map_campaign on game_map (campaign_id, sort_order);

-- Без этого realtime-событие DELETE несёт только PK, фильтр по campaign_id
-- не совпадает и клиенты не узнают об удалении карты.
alter table game_map replica identity full;

-- ---------------------------------------------------------------------
-- 7. Личная переписка ГМ ↔ игрок
--    recipient_id = null  →  сообщение всей кампании (объявление ГМа)
-- ---------------------------------------------------------------------
create table if not exists message (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaign on delete cascade,
  sender_id    uuid not null references app_user on delete cascade,
  recipient_id uuid references app_user on delete cascade,
  -- private: личное ГМ↔игрок; announcement: объявление ГМа всем;
  -- party: общий чат — пишут и читают все участники кампании
  channel      text not null default 'private'
                check (channel in ('private', 'announcement', 'party')),
  body         text not null default '',
  -- фото-вложение: ключ файла в бакете chat-files (<campaign_id>/<uuid>.<ext>)
  attachment_path text,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  -- либо текст, либо вложение (можно и то и другое); совсем пустое — нельзя
  constraint message_not_empty check (
    length(body) between 1 and 4000
    or (attachment_path is not null and length(body) <= 4000)
  )
);

create index if not exists idx_msg_thread on message (campaign_id, sender_id, recipient_id, created_at desc);

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================
alter table app_user        enable row level security;
alter table character_macro enable row level security;
alter table campaign        enable row level security;
alter table campaign_member enable row level security;
alter table character_sheet enable row level security;
alter table feature         enable row level security;
alter table inventory_item  enable row level security;
alter table equipped_item   enable row level security;
alter table npc             enable row level security;
alter table quest           enable row level security;
alter table potion          enable row level security;
alter table consumable      enable row level security;
alter table dice_roll       enable row level security;
alter table game_map        enable row level security;
alter table message         enable row level security;

-- --- Пользователи: видно всех, с кем делишь кампанию ------------------
drop policy if exists app_user_read on app_user;
create policy app_user_read on app_user for select using (
  id = auth.uid()
  or exists (
    select 1
    from campaign_member me
    join campaign_member them on them.campaign_id = me.campaign_id
    where me.user_id = auth.uid() and them.user_id = app_user.id
  )
);
drop policy if exists app_user_write on app_user;
create policy app_user_write on app_user for update using (id = auth.uid());

-- --- Кампании ---------------------------------------------------------
drop policy if exists campaign_read on campaign;
create policy campaign_read   on campaign for select using (is_member(id));
drop policy if exists campaign_create on campaign;
create policy campaign_create on campaign for insert with check (gm_id = auth.uid());
drop policy if exists campaign_admin on campaign;
create policy campaign_admin  on campaign for update using (is_gm(id));
drop policy if exists campaign_drop on campaign;
create policy campaign_drop   on campaign for delete using (gm_id = auth.uid());

drop policy if exists member_read on campaign_member;
create policy member_read  on campaign_member for select using (is_member(campaign_id));
-- Прямой insert в campaign_member из клиента ЗАПРЕЩЁН (политики на insert нет):
-- вступление — только через RPC join_campaign_by_code (проверяет код),
-- ГМа назначает только create_campaign(). Обе — SECURITY DEFINER и обходят RLS.
drop policy if exists member_join on campaign_member;
drop policy if exists member_kick on campaign_member;
create policy member_kick  on campaign_member for delete using (is_gm(campaign_id) or user_id = auth.uid());

-- --- Листы персонажей -------------------------------------------------
-- ГМ видит листы своей кампании целиком, но менять их не может.
drop policy if exists sheet_read on character_sheet;
create policy sheet_read on character_sheet for select using (
  owner_id = auth.uid()
  or (campaign_id is not null and is_gm(campaign_id))
);
drop policy if exists sheet_insert on character_sheet;
create policy sheet_insert on character_sheet for insert with check (
  owner_id = auth.uid() and (campaign_id is null or is_member(campaign_id))
);
drop policy if exists sheet_update on character_sheet;
create policy sheet_update on character_sheet for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (campaign_id is null or is_member(campaign_id)));
drop policy if exists sheet_delete on character_sheet;
create policy sheet_delete on character_sheet for delete using (owner_id = auth.uid());

-- --- Содержимое листа: те же права, что у самого листа ----------------
-- Читать может владелец и ГМ кампании; писать — только владелец.
create or replace function can_read_sheet(sheet_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from character_sheet s
    where s.id = sheet_id
      and (s.owner_id = auth.uid()
           or (s.campaign_id is not null and is_gm(s.campaign_id)))
  );
$$;

create or replace function owns_sheet(sheet_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from character_sheet s
    where s.id = sheet_id and s.owner_id = auth.uid()
  );
$$;

do $$
declare t text;
begin
  foreach t in array array['feature','inventory_item','equipped_item','npc','quest','potion','consumable','character_macro']
  loop
    execute format('drop policy if exists %1$s_read on %1$s;', t);
    execute format('create policy %1$s_read   on %1$s for select using (can_read_sheet(character_id));', t);
    execute format('drop policy if exists %1$s_insert on %1$s;', t);
    execute format('create policy %1$s_insert on %1$s for insert with check (owns_sheet(character_id));', t);
    execute format('drop policy if exists %1$s_update on %1$s;', t);
    execute format('create policy %1$s_update on %1$s for update using (owns_sheet(character_id));', t);
    execute format('drop policy if exists %1$s_delete on %1$s;', t);
    execute format('create policy %1$s_delete on %1$s for delete using (owns_sheet(character_id));', t);
  end loop;
end $$;

-- --- Броски: общая лента кампании -------------------------------------
drop policy if exists roll_read on dice_roll;
create policy roll_read on dice_roll for select using (
  is_member(campaign_id)
  and (not is_secret or user_id = auth.uid() or is_gm(campaign_id))
);
drop policy if exists roll_insert on dice_roll;
create policy roll_insert on dice_roll for insert with check (
  user_id = auth.uid() and is_member(campaign_id)
);
-- броски не редактируются и не удаляются: лента — это протокол игры.
-- ЕДИНСТВЕННОЕ исключение — колонка is_pending («Стоп» у своего крутящегося
-- броска): policy разрешает update только автору, а column-grant ниже
-- ограничивает запись ТОЛЬКО этой колонкой — результат неизменяем.
drop policy if exists roll_reveal on dice_roll;
create policy roll_reveal on dice_roll for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on dice_roll from authenticated;
grant update (is_pending) on dice_roll to authenticated;

-- --- Карты: правит ГМ, игроки видят только открытые --------------------
drop policy if exists map_read on game_map;
create policy map_read on game_map for select using (
  is_gm(campaign_id) or (is_member(campaign_id) and is_revealed)
);
drop policy if exists map_write on game_map;
create policy map_write  on game_map for insert with check (is_gm(campaign_id));
drop policy if exists map_update on game_map;
create policy map_update on game_map for update using (is_gm(campaign_id));
drop policy if exists map_delete on game_map;
create policy map_delete on game_map for delete using (is_gm(campaign_id));

-- --- Переписка --------------------------------------------------------
-- Видно своё: отправленное, полученное и объявления всей кампании.
drop policy if exists message_read on message;
create policy message_read on message for select using (
  is_member(campaign_id)
  and (sender_id = auth.uid() or recipient_id = auth.uid() or recipient_id is null)
);
-- Игрок пишет только ГМу. ГМ пишет кому угодно в своей кампании,
-- в том числе объявление всем (recipient_id is null).
drop policy if exists message_send on message;
create policy message_send on message for insert with check (
  sender_id = auth.uid()
  and is_member(campaign_id)
  and (
    -- общий чат: любой участник, без адресата
    (channel = 'party' and recipient_id is null)
    -- объявление всем: только ГМ, без адресата
    or (channel = 'announcement' and recipient_id is null and is_gm(campaign_id))
    -- личное: ГМ — любому участнику своей кампании; игрок — только ГМу
    or (channel = 'private' and recipient_id is not null and (
      (is_gm(campaign_id) and exists (
          select 1 from campaign_member cm
          where cm.campaign_id = message.campaign_id
            and cm.user_id = message.recipient_id
      ))
      or exists (
          select 1 from campaign_member
          where campaign_id = message.campaign_id
            and user_id = message.recipient_id
            and role = 'gm'
      )
    ))
  )
);
drop policy if exists message_mark_read on message;
create policy message_mark_read on message for update using (recipient_id = auth.uid());

-- =====================================================================
--  REALTIME — что клиент получает push-уведомлениями
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table dice_roll;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table message;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table game_map;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table character_sheet;
exception when duplicate_object then null;
end $$;

-- =====================================================================
--  STORAGE — картинки карт
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('maps', 'maps', false)
on conflict (id) do nothing;

-- Путь файла: <campaign_id>/<map_id>.<ext> — первый сегмент даёт кампанию.
-- Чтение файла привязано к статусу карты: скрыл карту — отозвал и файл,
-- даже если игрок сохранил storage_path, пока карта была открыта.
drop policy if exists map_file_read on storage.objects;
create policy map_file_read on storage.objects for select using (
  bucket_id = 'maps'
  and exists (
    select 1 from game_map m
    where m.storage_path = name
      and (is_gm(m.campaign_id) or (is_member(m.campaign_id) and m.is_revealed))
  )
);
drop policy if exists map_file_write on storage.objects;
create policy map_file_write on storage.objects for insert with check (
  bucket_id = 'maps'
  and is_gm((storage.foldername(name))[1]::uuid)
);
drop policy if exists map_file_delete on storage.objects;
create policy map_file_delete on storage.objects for delete using (
  bucket_id = 'maps'
  and is_gm((storage.foldername(name))[1]::uuid)
);

-- Фото-вложения чата. Путь: <campaign_id>/<uuid>.<ext>.
-- Читать файл может только тот, кому видно само сообщение (личное — двум
-- сторонам, объявление — всей кампании); писать — участник кампании.
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', false)
on conflict (id) do nothing;

drop policy if exists chat_file_read on storage.objects;
create policy chat_file_read on storage.objects for select using (
  bucket_id = 'chat-files'
  and exists (
    select 1 from message m
    where m.attachment_path = name
      and is_member(m.campaign_id)
      and (m.sender_id = auth.uid() or m.recipient_id = auth.uid() or m.recipient_id is null)
  )
);
drop policy if exists chat_file_write on storage.objects;
create policy chat_file_write on storage.objects for insert with check (
  bucket_id = 'chat-files'
  and is_member((storage.foldername(name))[1]::uuid)
);

-- Аватарки персонажей. Путь: <owner_id>/<uuid>.<ext>.
-- Писать/удалять — только в свою папку; читать может тот, кому виден лист
-- с этой аватаркой (владелец и ГМ кампании листа).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists avatar_read on storage.objects;
-- ВАЖНО: name обязан быть квалифицирован как storage.objects.name — у
-- character_sheet есть собственная колонка name, и неквалифицированное имя
-- захватывается ею (внутренняя область видимости), ломая политику молча.
-- Читают: владелец листа, ГМ кампании и любой участник той же кампании.
-- Последнее — осознанное послабление РОВНО на картинку: в общей ленте бросков
-- и в чате партия должна видеть аватарки друг друга. Сам лист при этом
-- по-прежнему закрыт (sheet_read не тронут), видна только картинка, имя
-- персонажа отдаёт party_avatars ниже.
--
-- ВАЖНО (стоило часа отладки, второй раз на тех же граблях): подзапрос
-- «select 1 from character_sheet …» ВНУТРИ политики выполняется от имени
-- текущего пользователя и сам подчиняется sheet_read. Игроку чужой лист не
-- виден — значит EXISTS пуст, и политика молча ложна, сколько бы правильных
-- условий в неё ни дописали. Раньше это работало только потому, что владелец
-- и ГМ свои строки и так видят. Поэтому проверка вынесена в SECURITY DEFINER
-- функцию: только она имеет право заглянуть в чужой лист — и отдаёт наружу
-- один boolean, а не данные.
create or replace function avatar_visible(p_name text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from character_sheet s
    where s.avatar_path = p_name
      and (s.owner_id = auth.uid()
           or (s.campaign_id is not null and is_member(s.campaign_id)))
  );
$$;

create policy avatar_read on storage.objects for select using (
  bucket_id = 'avatars' and avatar_visible(storage.objects.name)
);
drop policy if exists avatar_write on storage.objects;
create policy avatar_write on storage.objects for insert with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists avatar_delete on storage.objects;
create policy avatar_delete on storage.objects for delete using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------
-- RPC: аватарки партии. sheet_read намеренно не пускает игрока к чужим
-- листам, но лента бросков и чат должны показывать, КТО бросил — с лицом.
-- Поэтому отдаём ровно три поля (владелец, имя персонажа, путь к картинке),
-- а не строку листа целиком. SECURITY DEFINER + явная проверка членства:
-- без неё функция стала бы дырой «покажи аватарки любой кампании по uuid».
-- ---------------------------------------------------------------------
-- Отдаёт заодно ХП и КД: их видит вся партия в трекере боя. Это тоже
-- осознанное послабление и тоже НЕ открытие листа — ни золото, ни заметки,
-- ни характеристики наружу не идут.
create or replace function party_status(p_campaign uuid)
returns table (
  owner_id     uuid,
  character_id uuid,
  char_name    text,
  avatar_path  text,
  hp_current   int,
  hp_max       int,
  armor_class  int
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_campaign) then
    raise exception 'not_a_member';
  end if;
  return query
    select s.owner_id, s.id, coalesce(nullif(s.char_name, ''), s.name), s.avatar_path,
           s.hp_current, s.hp_max, s.armor_class
    from character_sheet s
    where s.campaign_id = p_campaign;
end;
$$;

-- Игрок бросает инициативу сам за себя. Прямой update ему не разрешён
-- (initiative_update — только ГМ), иначе он мог бы и ход себе передать, и
-- чужие строки править. Через функцию правится ровно одно поле ровно у своей
-- записи; если игрока ещё нет в бою — он в него встаёт.
create or replace function set_my_initiative(p_campaign uuid, p_value int)
returns void
language plpgsql security definer set search_path = public as $$
declare s_id uuid; s_name text;
begin
  if not is_member(p_campaign) then
    raise exception 'not_a_member';
  end if;
  select s.id, coalesce(nullif(s.char_name, ''), s.name)
    into s_id, s_name
    from character_sheet s
    where s.campaign_id = p_campaign and s.owner_id = auth.uid()
    limit 1;
  if s_id is null then
    raise exception 'no_sheet';
  end if;

  update initiative_entry set initiative = p_value
    where campaign_id = p_campaign and character_id = s_id;
  if not found then
    insert into initiative_entry (campaign_id, name, initiative, character_id)
    values (p_campaign, s_name, p_value, s_id);
  end if;
end;
$$;

-- Раунд боя правит только ГМ. Через функцию, потому что у campaign_state
-- политик записи нет вообще (см. выше).
create or replace function set_combat_round(p_campaign uuid, p_round int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_gm(p_campaign) then
    raise exception 'not_gm';
  end if;
  insert into campaign_state (campaign_id, combat_round, updated_at)
  values (p_campaign, greatest(0, p_round), now())
  on conflict (campaign_id)
  do update set combat_round = greatest(0, p_round), updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: вступление в кампанию по коду (обходит RLS осознанно:
-- игрок ещё не участник и не может видеть кампанию через select)
-- ---------------------------------------------------------------------
create or replace function join_campaign_by_code(code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c_id uuid;
begin
  select id into c_id from campaign where join_code = upper(trim(code));
  if c_id is null then
    raise exception 'campaign_not_found';
  end if;
  insert into campaign_member (campaign_id, user_id, role)
  values (c_id, auth.uid(), 'player')
  on conflict (campaign_id, user_id) do nothing;
  return c_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: создание кампании (обходит RLS осознанно: campaign_read требует
-- членства, а на момент insert().select() членства ещё нет — без RPC
-- клиент не смог бы прочитать только что созданную строку).
-- ---------------------------------------------------------------------
create or replace function create_campaign(campaign_name text)
returns campaign
language plpgsql security definer set search_path = public as $$
declare
  c campaign;
  attempts int := 0;
  new_code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  loop
    attempts := attempts + 1;
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;
    begin
      insert into campaign (name, join_code, gm_id)
      values (campaign_name, new_code, auth.uid())
      returning * into c;
      exit;
    exception when unique_violation then
      if attempts >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into campaign_member (campaign_id, user_id, role)
  values (c.id, auth.uid(), 'gm');

  return c;
end;
$$;

-- Оба RPC работают через SECURITY DEFINER и должны быть доступны только
-- вошедшим пользователям — не anon и не напрямую через PostgREST от public.
-- ---------------------------------------------------------------------
-- Состояние кампании: какая карта открыта игрокам сейчас.
-- Нужна потому, что realtime-событие «карту скрыли» не доставляется игроку:
-- после скрытия строка game_map перестаёт проходить его RLS-чтение, и push
-- по ней молча выпадает. Строка campaign_state читаема участникам ВСЕГДА —
-- её обновления доезжают до всех, клиент по ним перечитывает список карт.
-- ---------------------------------------------------------------------
create table if not exists campaign_state (
  campaign_id    uuid primary key references campaign on delete cascade,
  current_map_id uuid references game_map on delete set null,
  -- Номер раунда боя: 0 — бой не идёт. Здесь, а не в initiative_entry,
  -- потому что раунд один на кампанию, а не на бойца.
  combat_round   int not null default 0,
  updated_at     timestamptz not null default now()
);
alter table campaign_state add column if not exists combat_round int not null default 0;

-- ---------------------------------------------------------------------
-- Трекер инициативы боя. Строки правит только ГМ, читают все участники —
-- select-политика не зависит от содержимого, поэтому realtime-события
-- доходят до всех всегда (урок campaign_state).
-- ---------------------------------------------------------------------
create table if not exists initiative_entry (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaign on delete cascade,
  name         text not null,
  initiative   int  not null default 0,
  is_current   boolean not null default false,
  character_id uuid references character_sheet on delete set null,
  -- ХП и КД нужны монстрам (character_id is null): у персонажей они живут в
  -- листе и приезжают через party_status, дублировать их здесь нельзя —
  -- разъедутся с листом на первом же ударе.
  hp_current   int,
  hp_max       int,
  ac           int,
  created_at   timestamptz not null default now()
);
alter table initiative_entry add column if not exists hp_current int;
alter table initiative_entry add column if not exists hp_max int;
alter table initiative_entry add column if not exists ac int;

create index if not exists idx_initiative_campaign on initiative_entry (campaign_id, initiative desc);

alter table initiative_entry enable row level security;
drop policy if exists initiative_read on initiative_entry;
create policy initiative_read on initiative_entry for select using (is_member(campaign_id));
drop policy if exists initiative_write on initiative_entry;
create policy initiative_write on initiative_entry for insert with check (is_gm(campaign_id));
drop policy if exists initiative_update on initiative_entry;
create policy initiative_update on initiative_entry for update using (is_gm(campaign_id));
drop policy if exists initiative_delete on initiative_entry;
create policy initiative_delete on initiative_entry for delete using (is_gm(campaign_id));

do $$ begin
  alter publication supabase_realtime add table initiative_entry;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Токены на карте: фишки персонажей/монстров, двигает ГМ, видят все.
-- Видимость привязана к карте: игроку токен виден только на открытой карте
-- (скрыл карту — токены «уехали» вместе с ней; события при этом перестают
-- доходить, но игрок и так теряет карту — сигналит campaign_state).
-- Координаты нормированные 0..1 от размеров картинки.
-- ---------------------------------------------------------------------
create table if not exists map_token (
  id           uuid primary key default gen_random_uuid(),
  map_id       uuid not null references game_map on delete cascade,
  campaign_id  uuid not null references campaign on delete cascade,
  label        text not null default '',
  color        text not null default '#7c5cff',
  x            double precision not null default 0.5,
  y            double precision not null default 0.5,
  character_id uuid references character_sheet on delete set null,
  -- токен-портал: тап проваливается в указанную карту (детализация местности)
  target_map_id uuid references game_map (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_token_map on map_token (map_id);

alter table map_token enable row level security;
drop policy if exists token_read on map_token;
create policy token_read on map_token for select using (
  exists (
    select 1 from game_map m
    where m.id = map_token.map_id
      and (is_gm(m.campaign_id) or (is_member(m.campaign_id) and m.is_revealed))
  )
);
drop policy if exists token_write on map_token;
create policy token_write on map_token for insert with check (is_gm(campaign_id));
drop policy if exists token_update on map_token;
create policy token_update on map_token for update using (is_gm(campaign_id));
drop policy if exists token_delete on map_token;
create policy token_delete on map_token for delete using (is_gm(campaign_id));

alter table map_token replica identity full;

do $$ begin
  alter publication supabase_realtime add table map_token;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Личные метки на карте: каждый участник ставит свои булавки с заметками.
-- ПОЛНОСТЬЮ приватные — видит и правит только автор (даже ГМ не видит
-- чужие). Координаты нормированные 0..1, как у map_token.
-- ---------------------------------------------------------------------
create table if not exists map_pin (
  id         uuid primary key default gen_random_uuid(),
  map_id     uuid not null references game_map on delete cascade,
  owner_id   uuid not null references app_user on delete cascade,
  label      text not null default '',
  body       text not null default '',
  color      text not null default '#ffb020',
  x          double precision not null default 0.5,
  y          double precision not null default 0.5,
  created_at timestamptz not null default now()
);

create index if not exists idx_pin_map_owner on map_pin (map_id, owner_id);

alter table map_pin enable row level security;
drop policy if exists pin_own on map_pin;
create policy pin_own on map_pin for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- Приватные заметки ГМа о каждом игроке. Видит и правит только ГМ кампании.
-- ---------------------------------------------------------------------
create table if not exists gm_note (
  campaign_id     uuid not null references campaign on delete cascade,
  subject_user_id uuid not null references app_user on delete cascade,
  body            text not null default '',
  updated_at      timestamptz not null default now(),
  primary key (campaign_id, subject_user_id)
);

alter table gm_note enable row level security;
drop policy if exists gm_note_all on gm_note;
create policy gm_note_all on gm_note for all
  using (is_gm(campaign_id)) with check (is_gm(campaign_id));

alter table campaign_state enable row level security;
drop policy if exists state_read on campaign_state;
create policy state_read on campaign_state for select using (is_member(campaign_id));
-- запись — только через SECURITY DEFINER функции ниже, политики insert/update нет

do $$ begin
  alter publication supabase_realtime add table campaign_state;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- RPC: показать карту игрокам. Открытых карт может быть НЕСКОЛЬКО
-- (мировая + детализации); current_map_id в campaign_state — какую ГМ
-- показал последней (сигнал переключения для игроков).
-- ---------------------------------------------------------------------
create or replace function reveal_map(map_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare c_id uuid;
begin
  select campaign_id into c_id from game_map where id = map_id;
  if c_id is null then
    raise exception 'map_not_found';
  end if;
  if not is_gm(c_id) then
    raise exception 'not_gm';
  end if;
  update game_map set is_revealed = true where id = map_id;
  insert into campaign_state (campaign_id, current_map_id, updated_at)
  values (c_id, map_id, now())
  on conflict (campaign_id)
  do update set current_map_id = excluded.current_map_id, updated_at = now();
end;
$$;

-- RPC: скрыть карту. Через ту же campaign_state игроки узнают об этом мгновенно.
create or replace function hide_map(map_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare c_id uuid;
begin
  select campaign_id into c_id from game_map where id = map_id;
  if c_id is null then
    raise exception 'map_not_found';
  end if;
  if not is_gm(c_id) then
    raise exception 'not_gm';
  end if;
  update game_map set is_revealed = false where id = map_id;
  insert into campaign_state (campaign_id, current_map_id, updated_at)
  values (c_id, null, now())
  on conflict (campaign_id)
  do update set current_map_id = null, updated_at = now();
end;
$$;

revoke execute on function join_campaign_by_code(text) from public, anon;
grant  execute on function join_campaign_by_code(text) to authenticated;
revoke execute on function create_campaign(text) from public, anon;
grant  execute on function create_campaign(text) to authenticated;
revoke execute on function reveal_map(uuid) from public, anon;
grant  execute on function reveal_map(uuid) to authenticated;
revoke execute on function hide_map(uuid) from public, anon;
grant  execute on function hide_map(uuid) to authenticated;
revoke execute on function party_status(uuid) from public, anon;
grant  execute on function party_status(uuid) to authenticated;
revoke execute on function set_my_initiative(uuid, int) from public, anon;
grant  execute on function set_my_initiative(uuid, int) to authenticated;
revoke execute on function set_combat_round(uuid, int) from public, anon;
grant  execute on function set_combat_round(uuid, int) to authenticated;
