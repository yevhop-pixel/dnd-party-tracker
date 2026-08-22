-- Кусок schema.sql к накатыванию в SQL Editor Supabase (2026-08-22).
-- Идемпотентен: те же create/alter … if not exists и drop policy if exists,
-- что и в основном файле, откуда он и вырезан целиком.

-- =====================================================================
--  БЕСТИАРИЙ И ПЕРСОНАЖИ МИРА — картотека ГМа с выборочной видимостью
-- =====================================================================
-- Просьба ГМа: заводить монстров и NPC с картинкой, а потом решать по
-- каждому, кому его показывать — всей партии, одному игроку, двоим, или
-- пока никому. Отсюда три состояния видимости и таблица-связка на случай
-- «этим двоим»: булев флаг (как is_revealed у карт) такого не умеет, а
-- одной колонки-адресата (как recipient_id у сообщений) мало.

create table if not exists bestiary_entry (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaign on delete cascade,
  -- Одна таблица на монстров и на людей: поля у них одни и те же, а разводит
  -- их вкладка. text + check, как везде в этой схеме — enum-типов тут нет.
  kind          text not null default 'beast' check (kind in ('beast', 'npc')),
  name          text not null,
  -- «Молодой белый дракон, хаотично-злой» / «трактирщик из Фандалина»
  subtitle      text not null default '',
  description   text not null default '',
  -- Боевые числа необязательны (у трактирщика их нет), поэтому nullable, а не
  -- 0: ноль хитов — это труп, а пустое поле — это «не заполняли».
  hp            int,
  ac            int,
  speed         text not null default '',
  -- Характеристики и способности одной строкой/абзацем: структурировать их
  -- по колонкам значит зафиксировать одну редакцию правил, а стол играет по
  -- своим. Свободный текст переживёт любую.
  stats         text not null default '',
  abilities     text not null default '',
  loot          text not null default '',
  -- Объект в бакете 'bestiary', путь '<campaign_id>/<uuid>.<ext>'
  image_path    text,
  -- 'gm' — только ГМ (заготовка на будущую сцену), 'all' — вся партия,
  -- 'chosen' — только те, кто перечислен в bestiary_viewer.
  visibility    text not null default 'gm' check (visibility in ('gm', 'all', 'chosen')),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_bestiary_campaign
  on bestiary_entry (campaign_id, kind, sort_order, created_at);

-- Кому показан конкретный монстр при visibility = 'chosen'.
create table if not exists bestiary_viewer (
  entry_id uuid not null references bestiary_entry on delete cascade,
  user_id  uuid not null references app_user on delete cascade,
  primary key (entry_id, user_id)
);

drop trigger if exists bestiary_entry_set_updated_at on bestiary_entry;
create trigger bestiary_entry_set_updated_at
  before update on bestiary_entry
  for each row execute function set_updated_at();

alter table bestiary_entry  enable row level security;
alter table bestiary_viewer enable row level security;

-- ВАЖНО, третий раз те же грабли (см. комментарий у avatar_visible выше):
-- подзапрос «select 1 from bestiary_viewer …» ВНУТРИ политики на
-- bestiary_entry выполнялся бы от имени текущего пользователя и подчинялся
-- бы RLS самой bestiary_viewer — а её игрок читать не должен. EXISTS молча
-- вернул бы пусто, и «показать этим двоим» не работало бы никогда. Поэтому
-- проверка живёт в SECURITY DEFINER функции и отдаёт наружу один boolean.
create or replace function bestiary_shown_to_me(p_entry uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from bestiary_viewer v
    where v.entry_id = p_entry and v.user_id = auth.uid()
  );
$$;

-- Кампания записи — чтобы политики bestiary_viewer могли спросить «а ты ГМ
-- той кампании?», не читая саму запись через RLS.
create or replace function bestiary_entry_gm(p_entry uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select is_gm((select e.campaign_id from bestiary_entry e where e.id = p_entry));
$$;

drop policy if exists bestiary_read on bestiary_entry;
create policy bestiary_read on bestiary_entry for select using (
  is_gm(campaign_id)
  or (
    is_member(campaign_id)
    and (visibility = 'all' or (visibility = 'chosen' and bestiary_shown_to_me(id)))
  )
);
drop policy if exists bestiary_write on bestiary_entry;
create policy bestiary_write on bestiary_entry for insert with check (is_gm(campaign_id));
drop policy if exists bestiary_update on bestiary_entry;
create policy bestiary_update on bestiary_entry for update using (is_gm(campaign_id));
drop policy if exists bestiary_delete on bestiary_entry;
create policy bestiary_delete on bestiary_entry for delete using (is_gm(campaign_id));

-- Список «кому показано» правит и читает только ГМ: игроку он не нужен даже
-- для себя — своё право видеть запись он и так реализует, просто получая её.
drop policy if exists bestiary_viewer_gm on bestiary_viewer;
create policy bestiary_viewer_gm on bestiary_viewer for all
  using (bestiary_entry_gm(entry_id))
  with check (bestiary_entry_gm(entry_id));

-- Картинки бестиария — свой приватный бакет, путь '<campaign_id>/<uuid>.<ext>'.
insert into storage.buckets (id, name, public)
values ('bestiary', 'bestiary', false)
on conflict (id) do nothing;

-- Видимость файла повторяет видимость записи: спрятал монстра — спрятал и
-- портрет (тот же приём, что у карт с is_revealed). Имя колонки обязательно
-- квалифицировано как storage.objects.name — у bestiary_entry своя колонка
-- name, и неквалифицированное имя молча захватилось бы ею.
create or replace function bestiary_image_visible(p_name text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from bestiary_entry e
    where e.image_path = p_name
      and (
        is_gm(e.campaign_id)
        or (
          is_member(e.campaign_id)
          and (
            e.visibility = 'all'
            or (e.visibility = 'chosen'
                and exists (select 1 from bestiary_viewer v
                            where v.entry_id = e.id and v.user_id = auth.uid()))
          )
        )
      )
  );
$$;

drop policy if exists bestiary_file_read on storage.objects;
create policy bestiary_file_read on storage.objects for select using (
  bucket_id = 'bestiary' and bestiary_image_visible(storage.objects.name)
);
drop policy if exists bestiary_file_write on storage.objects;
create policy bestiary_file_write on storage.objects for insert with check (
  bucket_id = 'bestiary' and is_gm((storage.foldername(storage.objects.name))[1]::uuid)
);
drop policy if exists bestiary_file_delete on storage.objects;
create policy bestiary_file_delete on storage.objects for delete using (
  bucket_id = 'bestiary' and is_gm((storage.foldername(storage.objects.name))[1]::uuid)
);

-- В realtime-публикацию bestiary_entry НАМЕРЕННО не добавлен. Payload
-- postgres_changes не проходит RLS-фильтрацию (на этом уже обожглись с
-- dice_roll.is_secret — см. комментарий в diceApi.ts), а тут в строке лежат
-- хиты и способности монстра, которых игрок видеть не должен: подписка
-- раздала бы их всем участникам кампании в обход политики. Свежесть даёт
-- перечитывание по таймеру на клиенте (useLiveSync) — картотека меняется
-- раз в сессию, двадцати секунд задержки хватает с запасом.
