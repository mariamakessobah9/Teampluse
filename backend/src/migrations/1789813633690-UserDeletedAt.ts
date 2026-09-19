import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `IF NOT EXISTS` plutot qu'un simple ADD : une base encore geree par
 * `synchronize` a deja pu creer la colonne au demarrage precedent, et la
 * migration echouerait alors sur « column already exists », empechant
 * l'application de demarrer.
 */
export class UserDeletedAt1789813633690 implements MigrationInterface {
    name = 'UserDeletedAt1789813633690'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN IF EXISTS "deletedAt"`,
        );
    }

}
