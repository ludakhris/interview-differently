-- Undoes 20261015120000_role_invite: pending invitations are lost. Delete the row from "_prisma_migrations" afterwards.
BEGIN;
DROP TABLE IF EXISTS "RoleInvite";
COMMIT;
