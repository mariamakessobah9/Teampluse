import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * - `removedAt` : retrait d'un membre par un administrateur de l'organisation.
 * - `clearedRooms` : conversations effacees par la personne depuis l'accueil,
 *   avec la date de l'effacement.
 * - Nettoyage : les comptes supprimes avant cette version restaient membres de
 *   leurs conversations, et s'affichaient « Compte supprime » chez les autres.
 *
 * Idempotente, comme les precedentes, pour une base passee par `synchronize`.
 */
export class MemberRemovalClearedRooms1790000000000 implements MigrationInterface {
    name = 'MemberRemovalClearedRooms1790000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clearedRooms" jsonb`);

        await queryRunner.query(`
            UPDATE "chat_rooms" r
               SET "adminId" = (
                 SELECT m."user_id" FROM "chat_room_members" m
                   JOIN "users" u ON u."id" = m."user_id"
                  WHERE m."chat_room_id" = r."id" AND u."deletedAt" IS NULL
                  LIMIT 1
               )
             WHERE r."adminId" IN (SELECT "id" FROM "users" WHERE "deletedAt" IS NOT NULL)
        `);
        await queryRunner.query(`
            DELETE FROM "chat_room_members"
             WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "deletedAt" IS NOT NULL)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "clearedRooms"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "removedAt"`);
    }

}
