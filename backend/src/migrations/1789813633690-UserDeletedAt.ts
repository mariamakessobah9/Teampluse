import { MigrationInterface, QueryRunner } from "typeorm";

export class UserDeletedAt1789813633690 implements MigrationInterface {
    name = 'UserDeletedAt1789813633690'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "deletedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
    }

}
