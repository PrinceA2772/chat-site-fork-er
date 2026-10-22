-- 036_transfer_half_made_owner.sql
-- Hand the '#half-made' room to user 'wenny' (admin-authorized data fix).
--
-- Why this is a SQL-editor job:
--   Server-side room rules (rooms RLS, delete_room, rename_room, the room
--   RPCs) all key off auth.uid(), so the room must be owned by wenny's own
--   browser auth uid -- not an account id and not an arbitrary string.
--   An anon/authenticated key cannot change ownership (rooms_update is gated
--   to the owner/admins, and neither operator_reassign_room nor
--   room_claim_ownership can be used here: the former is revoked from
--   anon/authenticated, the latter requires the caller to already be an admin
--   AND the old owner to have a users row -- owner 7a31aa6b has none).
--
-- wenny's identities (verified against public.users / presence):
--   6e0ee85a-8f49-4b15-80c1-b3b8e369e987  <- currently PRESENT in '#half-made' (active browser uid)
--   3fbd5518-339b-4db0-a024-99902e355184  <- older uid that holds the wenny users row (name + avatar)
--
-- 1) Move ownership to wenny's active browser uid and drop the old owner
--    (7a31aa6b-...) from admins.
update public.rooms
   set owner_id = '6e0ee85a-8f49-4b15-80c1-b3b8e369e987',
       admins   = array['6e0ee85a-8f49-4b15-80c1-b3b8e369e987']
 where name = 'half-made';

-- 2) Move wenny's users row onto the new owner uid so the owner resolves
--    directly (no message-history fallback). users.username has a UNIQUE
--    lower(username) index, so a SECOND row can't also be named 'wenny'
--    (23505). Moving the existing row keeps a single 'wenny' identity and
--    preserves her avatar. 6e0ee85a has no users row yet, so the PK is free.
update public.users
   set client_id = '6e0ee85a-8f49-4b15-80c1-b3b8e369e987',
       last_seen = (extract(epoch from now()) * 1000)::bigint
 where client_id = '3fbd5518-339b-4db0-a024-99902e355184'
   and lower(username) = 'wenny';

-- Verify after running:
--   select name, owner_id, admins from public.rooms where name = 'half-made';
--   select client_id, username from public.users where client_id in
--     ('6e0ee85a-8f49-4b15-80c1-b3b8e369e987','3fbd5518-339b-4db0-a024-99902e355184');
--
-- Rollback (restore previous owner + move wenny's row back):
--   update public.rooms set owner_id = '7a31aa6b-d4f3-4d73-94a7-4a10b339c5ef',
--          admins = array['7a31aa6b-d4f3-4d73-94a7-4a10b339c5ef']
--    where name = 'half-made';
--   update public.users set client_id = '3fbd5518-339b-4db0-a024-99902e355184'
--    where client_id = '6e0ee85a-8f49-4b15-80c1-b3b8e369e987'
--      and lower(username) = 'wenny';