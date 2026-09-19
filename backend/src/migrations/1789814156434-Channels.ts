import { MigrationInterface, QueryRunner } from "typeorm";

export class Channels1789814156434 implements MigrationInterface {
    name = 'Channels1789814156434'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD "isPublic" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD "description" character varying`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD "organizationId" uuid`);
        await queryRunner.query(`CREATE INDEX "IDX_2ba75ff2d039ef6a2e1283d15c" ON "chat_rooms" ("organizationId") `);
        await queryRunner.query(`ALTER TABLE "chat_rooms" ADD CONSTRAINT "FK_2ba75ff2d039ef6a2e1283d15c8" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

        // Les salons crees avant les organisations n'en portent aucune : sans
        // ce rattachement ils n'apparaitraient dans la decouverte d'aucune
        // equipe. On la deduit de leurs membres.
        await queryRunner.query(`
            UPDATE "chat_rooms" cr
            SET "organizationId" = (
                SELECT u."organizationId"
                FROM "chat_room_members" m
                JOIN "users" u ON u."id" = m."user_id"
                WHERE m."chat_room_id" = cr."id"
                  AND u."organizationId" IS NOT NULL
                LIMIT 1
            )
            WHERE cr."organizationId" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP CONSTRAINT "FK_2ba75ff2d039ef6a2e1283d15c8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2ba75ff2d039ef6a2e1283d15c"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN "organizationId"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "chat_rooms" DROP COLUMN "isPublic"`);
    }

}
