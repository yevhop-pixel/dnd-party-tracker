-- Кусок schema.sql к накатыванию в SQL Editor Supabase (2026-08-25).
-- Идемпотентен.

-- ---------------------------------------------------------------------
-- Лента бросков: только последние 20, остальное стирается само
-- ---------------------------------------------------------------------
-- Клиент и так показывает двадцать последних, но старые броски продолжали
-- копиться в базе: за вечер игры их набирается несколько сотен, и каждый
-- заход в кампанию тянул бы всё больше. Обрезаем на стороне базы, триггером
-- на вставке — тогда чистка происходит у ВСЕХ и без участия клиента.
--
-- Почему не из клиента: политика roll_clear разрешает удаление только ГМу,
-- то есть бросок игрока обрезал бы ленту лишь при ГМе онлайн. Триггер
-- SECURITY DEFINER работает всегда и одинаково.

-- Держим столько же, сколько показывает лента (MAX_ROWS в RollFeed.tsx).
create or replace function trim_roll_feed()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  delete from dice_roll d
  where d.campaign_id = new.campaign_id
    and d.id not in (
      select r.id
      from dice_roll r
      where r.campaign_id = new.campaign_id
      -- Тот же порядок, что у ленты: created_at desc с id как тай-брейкером,
      -- иначе два броска в одну миллисекунду обрезались бы наугад.
      order by r.created_at desc, r.id desc
      limit 20
    );
  return null;
end $fn$;

-- AFTER INSERT: сама вставка уже прошла, и новый бросок гарантированно попал
-- в двадцатку. DELETE триггер на вставку не поднимает, рекурсии нет.
drop trigger if exists dice_roll_trim on dice_roll;
create trigger dice_roll_trim
  after insert on dice_roll
  for each row execute function trim_roll_feed();

-- Встречный бросок ссылается на цель через contest_roll_id ... on delete set
-- null (см. таблицу выше), так что удаление старой цели не роняет ответ — он
-- просто перестаёт быть парным. Это и правильно: цели в ленте уже нет.
