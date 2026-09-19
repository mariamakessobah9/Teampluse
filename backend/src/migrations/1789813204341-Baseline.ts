import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration de reference : reconstitue le schema tel que `synchronize` le
 * creait jusqu'ici.
 *
 * Sur une base existante (celle de production, creee avant l'introduction des
 * migrations), tout est deja la : la migration se contente alors de
 * s'enregistrer comme appliquee. Sans ce garde-fou, le premier deploiement
 * echouerait sur « relation "messages" already exists » et l'application ne
 * demarrerait plus.
 */

export class Baseline1789813204341 implements MigrationInterface {
    name = 'Baseline1789813204341'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable("users")) {
            return;
        }
        // uuid_generate_v4() vient de cette extension : sur une base neuve
        // (nouvel environnement, base de test) elle n'est pas installee.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "content" text NOT NULL, "type" character varying NOT NULL DEFAULT 'text', "fileUrl" character varying, "fileName" character varying, "fileSize" integer, "duration" double precision, "status" character varying NOT NULL DEFAULT 'sent', "deletedForEveryone" boolean NOT NULL DEFAULT false, "deletedFor" text, "sender_id" uuid NOT NULL, "chat_room_id" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_da2dd8932f3db9446fba8749f4" ON "messages" ("chat_room_id", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_ebb9af9b790835df2619b258ea" ON "messages" ("chat_room_id", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "chat_rooms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying, "type" character varying NOT NULL DEFAULT 'direct', "avatar" character varying, "adminId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c69082bd83bffeb71b0f455bd59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "allowedDomains" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_963693341bd612aa01ddf3a4b6" ON "organizations" ("slug") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "email" character varying NOT NULL, "password" character varying NOT NULL, "avatar" character varying, "phone" character varying, "role" character varying NOT NULL DEFAULT 'member', "organizationId" uuid, "isActive" boolean NOT NULL DEFAULT true, "deactivatedAt" TIMESTAMP, "isOnline" boolean NOT NULL DEFAULT false, "otp" character varying, "otpExpiresAt" TIMESTAMP, "isVerified" boolean NOT NULL DEFAULT false, "pushTokens" text, "pinnedRoomIds" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f3d6aea8fcca58182b2e80ce97" ON "users" ("organizationId") `);
        await queryRunner.query(`CREATE TABLE "calls" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "caller_id" uuid NOT NULL, "callee_id" uuid NOT NULL, "type" character varying NOT NULL DEFAULT 'audio', "status" character varying NOT NULL DEFAULT 'missed', "duration" integer NOT NULL DEFAULT '0', "deletedFor" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d9171d91f8dd1a649659f1b6a20" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_62f57434932ad48803155f3da7" ON "calls" ("callee_id", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_62975f1d51b9de8c6a6e8fb6d8" ON "calls" ("caller_id", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "token" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'member', "organizationId" uuid NOT NULL, "invitedById" uuid, "expiresAt" TIMESTAMP NOT NULL, "acceptedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_97ab59cb592c7cec109741b592" ON "invitations" ("email") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e577dcf9bb6d084373ed399850" ON "invitations" ("token") `);
        await queryRunner.query(`CREATE INDEX "IDX_b9139f00cebfadced76bca3084" ON "invitations" ("organizationId") `);
        await queryRunner.query(`CREATE TABLE "chat_room_members" ("chat_room_id" uuid NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_56628fb4cec79f2a02f34caf339" PRIMARY KEY ("chat_room_id", "user_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cab77d6448846706ad9b0ba41c" ON "chat_room_members" ("chat_room_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f7d4d1d255b71027906de8357f" ON "chat_room_members" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_22133395bd13b970ccd0c34ab22" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_5bb8108b85199f4ae096599917f" FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_f3d6aea8fcca58182b2e80ce979" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "calls" ADD CONSTRAINT "FK_8d8b052cf7b6c41b6081c28e3f7" FOREIGN KEY ("caller_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "calls" ADD CONSTRAINT "FK_fbb74a6e36357bfec4f668b18ae" FOREIGN KEY ("callee_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_b9139f00cebfadced76bca3084f" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_room_members" ADD CONSTRAINT "FK_cab77d6448846706ad9b0ba41c9" FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "chat_room_members" ADD CONSTRAINT "FK_f7d4d1d255b71027906de8357f5" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revenir en arriere sur la reference detruit toutes les donnees.
        if (process.env.ALLOW_BASELINE_DOWN !== 'true') {
            throw new Error(
                "Annuler la migration de reference supprimerait toutes les tables. " +
                "Definir ALLOW_BASELINE_DOWN=true pour le faire sciemment.",
            );
        }
        await queryRunner.query(`ALTER TABLE "chat_room_members" DROP CONSTRAINT "FK_f7d4d1d255b71027906de8357f5"`);
        await queryRunner.query(`ALTER TABLE "chat_room_members" DROP CONSTRAINT "FK_cab77d6448846706ad9b0ba41c9"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_b9139f00cebfadced76bca3084f"`);
        await queryRunner.query(`ALTER TABLE "calls" DROP CONSTRAINT "FK_fbb74a6e36357bfec4f668b18ae"`);
        await queryRunner.query(`ALTER TABLE "calls" DROP CONSTRAINT "FK_8d8b052cf7b6c41b6081c28e3f7"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_f3d6aea8fcca58182b2e80ce979"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_5bb8108b85199f4ae096599917f"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_22133395bd13b970ccd0c34ab22"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f7d4d1d255b71027906de8357f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cab77d6448846706ad9b0ba41c"`);
        await queryRunner.query(`DROP TABLE "chat_room_members"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b9139f00cebfadced76bca3084"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e577dcf9bb6d084373ed399850"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97ab59cb592c7cec109741b592"`);
        await queryRunner.query(`DROP TABLE "invitations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_62975f1d51b9de8c6a6e8fb6d8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_62f57434932ad48803155f3da7"`);
        await queryRunner.query(`DROP TABLE "calls"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f3d6aea8fcca58182b2e80ce97"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_963693341bd612aa01ddf3a4b6"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
        await queryRunner.query(`DROP TABLE "chat_rooms"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ebb9af9b790835df2619b258ea"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_da2dd8932f3db9446fba8749f4"`);
        await queryRunner.query(`DROP TABLE "messages"`);
    }

}
