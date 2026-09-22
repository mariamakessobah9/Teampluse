import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Appels de groupe : un appel n'a plus un destinataire unique mais une liste
 * de participants, chacun avec son propre sort et sa propre duree.
 *
 * Idempotente comme les precedentes : sur une base encore geree par
 * `synchronize`, table et colonnes peuvent deja exister.
 */
export class GroupCalls1789900000000 implements MigrationInterface {
    name = 'GroupCalls1789900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "calls" ALTER COLUMN "callee_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "mode" character varying NOT NULL DEFAULT 'direct'`);
        await queryRunner.query(`ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "chat_room_id" uuid`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_68b788e648b70f4b707a3ab586" ON "calls" ("chat_room_id")`);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_68b788e648b70f4b707a3ab5868'
                ) THEN
                    ALTER TABLE "calls"
                        ADD CONSTRAINT "FK_68b788e648b70f4b707a3ab5868"
                        FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("id")
                        ON DELETE SET NULL ON UPDATE NO ACTION;
                END IF;
            END $$;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "call_participants" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "call_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "status" character varying NOT NULL DEFAULT 'missed',
                "is_initiator" boolean NOT NULL DEFAULT false,
                "duration" integer NOT NULL DEFAULT 0,
                CONSTRAINT "UQ_call_participant" UNIQUE ("call_id", "user_id"),
                CONSTRAINT "PK_call_participants" PRIMARY KEY ("id"),
                CONSTRAINT "FK_5ad8b0ca7906d9b77dfd2b23a12" FOREIGN KEY ("call_id")
                    REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                CONSTRAINT "FK_8d942ec53eddc173b50bfe77da8" FOREIGN KEY ("user_id")
                    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_df6450e31039538500fe0452d5" ON "call_participants" ("user_id", "call_id")`);

        // L'historique se lit desormais dans `call_participants` : sans cette
        // reprise, tous les appels passes avant la mise a jour disparaitraient
        // de l'onglet Appels.
        await queryRunner.query(`
            INSERT INTO "call_participants" ("call_id", "user_id", "status", "is_initiator", "duration")
            SELECT c."id", c."caller_id", 'joined', true, c."duration"
            FROM "calls" c
            ON CONFLICT ("call_id", "user_id") DO NOTHING
        `);
        await queryRunner.query(`
            INSERT INTO "call_participants" ("call_id", "user_id", "status", "is_initiator", "duration")
            SELECT c."id", c."callee_id",
                   CASE c."status"
                       WHEN 'completed' THEN 'joined'
                       WHEN 'rejected' THEN 'declined'
                       ELSE 'missed'
                   END,
                   false, c."duration"
            FROM "calls" c
            WHERE c."callee_id" IS NOT NULL
            ON CONFLICT ("call_id", "user_id") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "call_participants"`);
        await queryRunner.query(`ALTER TABLE "calls" DROP CONSTRAINT IF EXISTS "FK_68b788e648b70f4b707a3ab5868"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_68b788e648b70f4b707a3ab586"`);
        await queryRunner.query(`ALTER TABLE "calls" DROP COLUMN IF EXISTS "chat_room_id"`);
        await queryRunner.query(`ALTER TABLE "calls" DROP COLUMN IF EXISTS "mode"`);
        // Les appels de groupe n'ont pas de destinataire : on les retire
        // avant de retablir la contrainte.
        await queryRunner.query(`DELETE FROM "calls" WHERE "callee_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "calls" ALTER COLUMN "callee_id" SET NOT NULL`);
    }

}
