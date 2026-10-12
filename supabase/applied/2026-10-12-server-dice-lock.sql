-- Второй шаг серверных бросков (после 2026-10-12-server-dice.sql и после
-- выкатки клиента, который бросает через submit_roll / submit_check_roll).
-- Прямая вставка в dice_roll закрыта: строку броска может создать только
-- база, значит и число в ней выбрала база.
drop policy if exists roll_insert on dice_roll;
revoke insert on dice_roll from anon, authenticated;

select (select count(*) from pg_policies where tablename = 'dice_roll' and cmd = 'INSERT') as insert_policies,
       has_table_privilege('authenticated', 'dice_roll', 'INSERT') as auth_can_insert,
       has_function_privilege('authenticated', 'submit_roll(uuid, uuid, text, text, boolean, boolean, uuid, boolean)', 'EXECUTE') as can_roll;
